import assert from 'node:assert/strict';
import test from 'node:test';
import { launchBrowser, pageShell, startServer } from './harness.mjs';
const entry = `
import React from 'react'; import { createRoot } from 'react-dom/client'; import { flushSync } from 'react-dom'; import { PromptComposer } from '/src/supplemental/prompt-composer.mjs';
const root=createRoot(document.querySelector('#root')); window.events=[];
window.mount=(props={})=>flushSync(()=>root.render(React.createElement(PromptComposer,{defaultValue:'Initial',inputLabel:'Draft',inputProps:{name:'message',required:true,minLength:3,maxLength:30,placeholder:'Write a message…',onChange:e=>window.events.push(['input',e.currentTarget.tagName])},onChange:e=>window.events.push(['change',e.currentTarget.tagName]),onSubmit:e=>window.events.push(['submit',e.currentTarget.tagName]),onReset:e=>window.events.push(['reset',e.currentTarget.tagName]),onSend:value=>window.events.push(['send',value]),onValueChange:value=>window.events.push(['value',value]),sources:[{id:'a',label:'Notes',insertText:'@notes ',description:'Workspace notes'},{id:'b',label:'Research',insertText:'@research '}],commands:[{id:'s',label:'Summarize',insertText:'Summarize: '}],onSuggestionSelect:(item,kind)=>window.events.push(['suggestion',item.id,kind]),models:[{id:'a',label:'Standard'},{id:'b',label:'Detailed'}],defaultSelectedModel:'a',onModelChange:id=>window.events.push(['model',id]),onFilesSelected:files=>window.events.push(['files',files.map(f=>f.name)]),attachments:[{id:'file',label:'notes.txt'}],onRemoveAttachment:id=>window.events.push(['remove',id]),...props}))); window.mount();
`;
async function selectModel(page, label) {
  await page.getByRole('button', { name: /Model/u }).click();
  await page.getByRole('option', { name: label, exact: true }).click();
  await page.locator('.muxui-select-popover').waitFor({ state: 'detached' });
}
const modelValue = (page) => page.locator('.muxui-prompt-composer-model .muxui-select-value');
const fixture = pageShell({ attributes: 'data-muxui-color-scheme="light"', head: '<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/generated/styles.css"><link rel="stylesheet" href="/src/supplemental/prompt-composer.css">', bodyAttributes:'style="margin:0;padding:24px;background:var(--muxui-semantic-surface-canvas)"',body:'<main style="max-width:560px;margin:auto;padding-top:280px"><div id="root"></div></main>',entry:'/prompt-entry.mjs' });

test('PromptComposer native validation/reset, multiline/IME, caret menus, file/model actions and pending work by keyboard', { timeout: 120_000 }, async () => {
  const server=await startServer({entries:['src/supplemental/prompt-composer.mjs'],pages:{'/prompt.html':fixture},modules:{'/prompt-entry.mjs':entry}}); const browser=await launchBrowser(); const page=await browser.newPage({viewport:{width:800,height:700}});
  try {
    const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(server.url+'/prompt.html');const input=page.getByRole('textbox',{name:'Draft'});await input.waitFor();
    await input.fill('Hi');await page.keyboard.press('Enter');assert.equal((await page.evaluate(()=>window.events)).filter(e=>e[0]==='send').length,0);assert.equal(await input.evaluate(n=>n.validity.tooShort),true);
    await input.fill('Hello');await page.keyboard.press('Shift+Enter');assert.equal(await input.inputValue(),'Hello\n');await page.keyboard.type('there');await page.keyboard.press('Enter');assert.ok((await page.evaluate(()=>window.events)).some(e=>e[0]==='send'&&e[1]==='Hello\nthere'));assert.equal(new URL(page.url()).pathname,'/prompt.html');
    assert.ok((await page.evaluate(()=>window.events)).some(e=>e[0]==='input'&&e[1]==='TEXTAREA'));assert.ok((await page.evaluate(()=>window.events)).some(e=>e[0]==='change'&&e[1]==='FORM'));
    const count=(await page.evaluate(()=>window.events)).filter(e=>e[0]==='send').length;
    await input.dispatchEvent('compositionstart');await input.dispatchEvent('keydown',{key:'Enter',code:'Enter',isComposing:true});assert.equal((await page.evaluate(()=>window.events)).filter(e=>e[0]==='send').length,count);await input.dispatchEvent('compositionend');
    await input.fill('Read @');await page.getByRole('listbox',{name:'Sources'}).waitFor();assert.equal(await input.getAttribute('role'),null);assert.equal(await input.getAttribute('aria-expanded'),null);assert.equal(await input.getAttribute('aria-autocomplete'),'list');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');assert.equal(await input.inputValue(),'Read @research ');assert.equal(await input.evaluate(n=>n===document.activeElement),true);assert.equal((await page.evaluate(()=>window.events)).filter(e=>e[0]==='send').length,count);
    await input.fill('/su');await page.keyboard.press('Enter');assert.equal(await input.inputValue(),'Summarize: ');
    await page.evaluate(()=>document.querySelector('main').style.paddingTop='0');await input.fill('@');const menu=page.getByRole('listbox');await menu.waitFor();assert.equal(await menu.getAttribute('data-placement'),'below');assert.equal(await menu.evaluate(n=>n.getBoundingClientRect().top>=0&&n.getBoundingClientRect().bottom<=innerHeight),true);
    await page.setViewportSize({width:390,height:700});await page.evaluate(()=>document.querySelector('main').style.paddingTop='400px');await input.fill('@r');assert.equal(await menu.getAttribute('data-placement'),'above');assert.equal(await menu.evaluate(n=>n.getBoundingClientRect().top>=0&&n.getBoundingClientRect().right<=innerWidth),true);await page.setViewportSize({width:800,height:700});await page.evaluate(()=>document.querySelector('main').style.paddingTop='280px');
    await input.fill('@');await page.keyboard.press('Escape');assert.equal(await page.getByRole('listbox').count(),0);
    await input.fill('Before @no after');await page.keyboard.press('Home');for(let i=0;i<10;i++)await page.keyboard.press('ArrowRight');await page.getByRole('listbox').waitFor();await page.getByRole('option').first().click();assert.equal(await input.inputValue(),'Before @notes  after');
    await input.fill('@');await page.evaluate(()=>window.mount({inputProps:{name:'message',required:true,maxLength:3}}));await page.keyboard.press('Enter');assert.equal(await input.inputValue(),'@');
    await page.evaluate(()=>window.mount());await selectModel(page,'Detailed');assert.ok((await page.evaluate(()=>window.events)).some(e=>e[0]==='model'&&e[1]==='b'));
    await page.locator('input[type=file]').setInputFiles({name:'local.txt',mimeType:'text/plain',buffer:Buffer.from('local')});assert.ok((await page.evaluate(()=>window.events)).some(e=>e[0]==='files'&&e[1][0]==='local.txt'));await page.getByRole('button',{name:'Remove notes.txt'}).click();assert.ok((await page.evaluate(()=>window.events)).some(e=>e[0]==='remove'&&e[1]==='file'));
    await page.evaluate(()=>document.querySelector('form').reset());await page.waitForFunction(()=>document.querySelector('.muxui-select-value').textContent==='Standard');assert.equal(await input.inputValue(),'Initial');assert.equal(await modelValue(page).textContent(),'Standard');
    await page.evaluate(()=>window.mount({defaultSelectedModel:'b'}));await page.evaluate(()=>document.querySelector('form').reset());await page.waitForFunction(()=>document.querySelector('.muxui-select-value').textContent==='Detailed');assert.equal(await modelValue(page).textContent(),'Detailed');
    await page.evaluate(()=>window.mount({value:'Caller draft',selectedModel:'b'}));await page.waitForFunction(()=>document.querySelector('textarea').value==='Caller draft');await page.evaluate(()=>document.querySelector('form').reset());assert.equal(await input.inputValue(),'Caller draft');assert.equal(await modelValue(page).textContent(),'Detailed');
    await page.evaluate(()=>window.mount({pending:true,onStop:()=>window.events.push(['stop'])}));await page.getByRole('button',{name:'Stop response'}).click();assert.equal(await input.getAttribute('readonly'),'');assert.ok((await page.evaluate(()=>window.events)).some(e=>e[0]==='stop'));
    await page.evaluate(()=>window.mount({disabled:true,error:'Request failed'}));await page.waitForFunction(()=>document.querySelector('textarea').disabled);assert.equal(await input.isDisabled(),true);assert.equal(await page.getByRole('alert').textContent(),'Request failed');
    await page.setViewportSize({width:390,height:700});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.emulateMedia({forcedColors:'active'});assert.deepEqual(errors,[]);
  } finally {await browser.close();await server.close();}
});

test('PromptComposer invalidates external draft ranges, follows native external forms and resizes without editing', { timeout: 120_000 }, async () => {
  const server=await startServer({entries:['src/supplemental/prompt-composer.mjs'],pages:{'/prompt.html':fixture},modules:{'/prompt-entry.mjs':entry}}); const browser=await launchBrowser(); const page=await browser.newPage({viewport:{width:800,height:700}});
  try {
    const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(server.url+'/prompt.html');const input=page.getByRole('textbox',{name:'Draft'});await input.waitFor();
    await page.evaluate(()=>window.mount({value:'@no'}));await input.click();await page.keyboard.press('End');await page.getByRole('listbox',{name:'Sources'}).waitFor();
    await page.evaluate(()=>window.mount({value:'Zebra'}));await page.waitForFunction(()=>document.querySelector('textarea').value==='Zebra');assert.equal(await page.getByRole('listbox').count(),0);await page.keyboard.press('Enter');assert.equal(await input.inputValue(),'Zebra');assert.equal((await page.evaluate(()=>window.events)).filter(e=>e[0]==='suggestion').length,0);
    await page.evaluate(()=>{
      const external=document.createElement('form');external.id='external';external.addEventListener('submit',e=>{e.preventDefault();window.events.push(['external-submit',new FormData(external).get('message')]);});document.body.append(external);
      window.events=[];window.mount({inputProps:{form:'external',name:'message',required:true,minLength:3},defaultValue:'Initial'});
    });
    await page.waitForFunction(()=>document.querySelector('textarea').form?.id==='external' && document.querySelector('textarea').minLength===3);
    await input.fill('Hi');await page.getByRole('button',{name:'Send message'}).click();await input.press('Enter');assert.equal(await input.evaluate(n=>n.validity.tooShort),true);assert.deepEqual((await page.evaluate(()=>window.events)).filter(e=>['submit','external-submit','send'].includes(e[0])),[]);
    await input.fill('Hello');await page.getByRole('button',{name:'Send message'}).click();await input.press('Enter');assert.deepEqual((await page.evaluate(()=>window.events)).filter(e=>['submit','external-submit','send'].includes(e[0])),[['external-submit','Hello'],['external-submit','Hello']]);
    await selectModel(page,'Detailed');await input.fill('Edited draft');const valuesBeforeReset=(await page.evaluate(()=>window.events)).filter(e=>e[0]==='value');await page.evaluate(()=>document.querySelector('form.muxui-prompt-composer').reset());await page.waitForFunction(()=>document.querySelector('.muxui-select-value').textContent==='Standard');assert.equal(await input.inputValue(),'Edited draft');assert.equal(await modelValue(page).textContent(),'Standard');assert.deepEqual((await page.evaluate(()=>window.events)).filter(e=>e[0]==='value'),valuesBeforeReset);
    await selectModel(page,'Detailed');await page.evaluate(()=>document.querySelector('#external').reset());await page.waitForFunction(()=>document.querySelector('textarea').value==='Initial');assert.equal(await modelValue(page).textContent(),'Detailed');assert.equal((await page.evaluate(()=>window.events)).filter(e=>e[0]==='reset').length,1);
    await page.evaluate(()=>window.mount({value:'Caller draft',inputProps:{form:'external',name:'message',required:true,minLength:3}}));await page.waitForFunction(()=>document.querySelector('textarea').value==='Caller draft');await page.evaluate(()=>document.querySelector('#external').reset());assert.equal(await input.inputValue(),'Caller draft');
    await page.evaluate(()=>window.mount({inputProps:{form:'external',name:'message',required:true,minLength:3}}));await input.fill('Keep this draft');await page.evaluate(()=>{const form=document.querySelector('#external');form.addEventListener('reset',e=>e.preventDefault(),{once:true});form.reset();});assert.equal(await input.inputValue(),'Keep this draft');
    await page.evaluate(()=>{document.querySelector('main').style.paddingTop='0';window.mount({value:'',inputProps:{placeholder:'Write a detailed message about the current workspace and its sources'}});});await page.waitForFunction(()=>document.querySelector('textarea').value==='');
    // Model controls wrap below the draft on mobile; use a narrower width to force text reflow.
    const wide=await input.evaluate(n=>n.getBoundingClientRect().height);await page.setViewportSize({width:280,height:700});await page.waitForFunction(height=>document.querySelector('textarea').getBoundingClientRect().height>height,wide);assert.equal(await input.evaluate(n=>n.clientHeight>=n.scrollHeight),true);
    await page.setViewportSize({width:800,height:700});await page.evaluate(()=>window.mount({value:'Existing draft text wraps when the available input width becomes narrower',inputProps:{}}));await page.waitForFunction(()=>document.querySelector('textarea').value.startsWith('Existing draft'));const textWide=await input.evaluate(n=>n.getBoundingClientRect().height);await page.setViewportSize({width:280,height:700});await page.waitForFunction(height=>document.querySelector('textarea').getBoundingClientRect().height>height,textWide);assert.equal(await input.evaluate(n=>n.clientHeight>=n.scrollHeight),true);assert.deepEqual(errors,[]);
  } finally {await browser.close();await server.close();}
});

test('PromptComposer model Select preserves keyboard focus, caller state, reset and open-state gating without sending', { timeout: 120_000 }, async () => {
  const server = await startServer({ entries: ['src/supplemental/prompt-composer.mjs'], pages: { '/prompt.html': fixture }, modules: { '/prompt-entry.mjs': entry } });
  const browser = await launchBrowser(); const page = await browser.newPage({ viewport: { width: 800, height: 700 } });
  try {
    const errors = []; page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(server.url + '/prompt.html');
    const input = page.getByRole('textbox', { name: 'Draft' });
    const trigger = page.getByRole('button', { name: /Model/u });
    const popup = page.locator('.muxui-select-popover');
    const modelEvents = () => page.evaluate(() => window.events.filter((event) => event[0] === 'model'));
    await input.fill('@'); await page.getByRole('listbox', { name: 'Sources' }).waitFor();
    await trigger.click(); await popup.waitFor();
    assert.equal(await page.getByRole('listbox', { name: 'Sources' }).count(), 0);
    assert.equal(await input.getAttribute('aria-activedescendant'), null);
    await page.keyboard.press('Escape'); await popup.waitFor({ state: 'detached' });
    assert.equal(await trigger.evaluate((node) => node === document.activeElement), true);
    assert.equal(await trigger.getAttribute('type'), 'button');
    await trigger.press('Enter'); await popup.waitFor();
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
    await popup.waitFor({ state: 'detached' });
    assert.equal(await modelValue(page).textContent(), 'Detailed');
    assert.deepEqual(await modelEvents(), [['model', 'b']]);
    assert.equal(await trigger.evaluate((node) => node === document.activeElement), true);
    await selectModel(page, 'Standard');
    assert.deepEqual(await modelEvents(), [['model', 'b'], ['model', 'a']]);

    await page.evaluate(() => { window.events = []; window.mount({ selectedModel: 'a' }); });
    await selectModel(page, 'Detailed');
    assert.equal(await modelValue(page).textContent(), 'Standard');
    assert.deepEqual(await modelEvents(), [['model', 'b']]);
    await page.evaluate(() => window.mount({ selectedModel: 'b' }));
    assert.equal(await modelValue(page).textContent(), 'Detailed');
    await page.evaluate(() => document.querySelector('form').reset());
    assert.equal(await modelValue(page).textContent(), 'Detailed');
    assert.deepEqual(await modelEvents(), [['model', 'b']]);
    await page.evaluate(() => { window.events = []; window.mount({ defaultSelectedModel: 'b' }); document.querySelector('form').reset(); });
    assert.equal(await modelValue(page).textContent(), 'Detailed');
    assert.deepEqual(await modelEvents(), []);
    await selectModel(page, 'Standard');
    await page.evaluate(() => window.mount({ defaultSelectedModel: 'b', onResetCapture: (event) => { window.events.push(['capture', event.currentTarget.tagName]); event.preventDefault(); } }));
    await page.evaluate(() => document.querySelector('form').reset());
    assert.equal(await modelValue(page).textContent(), 'Standard');
    assert.deepEqual(await modelEvents(), [['model', 'a']]);
    assert.ok((await page.evaluate(() => window.events)).some((event) => event[0] === 'capture' && event[1] === 'FORM'));
    await page.evaluate(() => window.mount({ defaultSelectedModel: 'b' }));
    await page.evaluate(() => { document.body.addEventListener('reset', (event) => event.preventDefault(), { once: true }); document.querySelector('form').reset(); });
    assert.equal(await modelValue(page).textContent(), 'Standard');
    assert.deepEqual(await modelEvents(), [['model', 'a']]);

    for (const state of [{ pending: true }, { disabled: true }, { inputProps: { disabled: true } }]) {
      await trigger.click(); await popup.waitFor();
      await page.evaluate((props) => window.mount(props), state);
      await popup.waitFor({ state: 'detached' });
      assert.equal(await trigger.isDisabled(), true);
      const target = await trigger.evaluate((node) => { const rect = node.getBoundingClientRect(); return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }; });
      await page.mouse.click(target.x, target.y);
      assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
      assert.deepEqual(await modelEvents(), [['model', 'a']]);
      await page.evaluate(() => window.mount());
      assert.equal(await trigger.isDisabled(), false);
      assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
    }
    assert.deepEqual((await page.evaluate(() => window.events)).filter((event) => ['send', 'submit'].includes(event[0])), []);
    await page.setViewportSize({ width: 390, height: 700 });
    await page.evaluate(() => window.mount({ models: [{ id: 'a', label: 'A very long model label with additional detail for narrow layouts' }, { id: 'b', label: 'Detailed' }] }));
    assert.equal(await trigger.evaluate((node) => node.getBoundingClientRect().height), 32);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await page.locator('.muxui-select-value').evaluate((node) => node.scrollWidth > node.clientWidth), true);
    await trigger.click(); await popup.waitFor();
    assert.equal(await popup.evaluate((node) => { const rect = node.getBoundingClientRect(); return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight; }), true);
    await page.keyboard.press('Escape'); await popup.waitFor({ state: 'detached' });
    await page.evaluate(() => { window.events = []; window.mount({ models: [{ id: '', label: 'Empty ID' }, { id: 'model:a:b', label: 'Colon ID' }], selectedModel: '' }); });
    assert.equal(await modelValue(page).textContent(), 'Empty ID');
    await selectModel(page, 'Colon ID');
    assert.equal(await modelValue(page).textContent(), 'Empty ID');
    assert.deepEqual(await modelEvents(), [['model', 'model:a:b']]);
    await page.evaluate(() => window.mount({ models: [{ id: '', label: 'Empty ID' }, { id: 'model:a:b', label: 'Colon ID' }], selectedModel: 'model:a:b' }));
    assert.equal(await modelValue(page).textContent(), 'Colon ID');
    await selectModel(page, 'Empty ID');
    assert.deepEqual(await modelEvents(), [['model', 'model:a:b'], ['model', '']]);

    const available = { key: 'late-models', defaultSelectedModel: undefined, models: [{ id: 'x', label: 'Late model' }, { id: 'y', label: 'Other model' }] };
    await page.evaluate(() => { window.events = []; window.mount({ key: 'late-models', models: [], defaultSelectedModel: undefined }); });
    assert.equal(await trigger.count(), 0);
    await page.evaluate((props) => window.mount(props), available);
    assert.equal(await modelValue(page).textContent(), 'Late model');
    assert.deepEqual(await modelEvents(), []);
    await selectModel(page, 'Other model');
    await page.evaluate((props) => window.mount({ ...props, models: [{ id: 'z', label: 'New first model' }] }), available);
    assert.equal(await modelValue(page).textContent(), 'New first model');
    assert.deepEqual(await modelEvents(), [['model', 'y']]);
    await page.evaluate((props) => window.mount(props), available);
    assert.equal(await modelValue(page).textContent(), 'Other model');
    for (const reason of ['models', 'callback']) {
      await trigger.click(); await popup.waitFor();
      await page.evaluate(({ props, reason }) => window.mount({ ...props, ...(reason === 'models' ? { models: [] } : { onModelChange: undefined }) }), { props: available, reason });
      await trigger.waitFor({ state: 'detached' });
      await popup.waitFor({ state: 'detached' });
      await page.evaluate((props) => window.mount(props), available);
      await trigger.waitFor();
      assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
      assert.equal(await popup.count(), 0);
      assert.equal(await trigger.evaluate((node) => node === document.activeElement), false);
      assert.equal(await modelValue(page).textContent(), 'Other model');
    }
    assert.deepEqual(await modelEvents(), [['model', 'y']]);
    await page.evaluate((props) => window.mount({ ...props, selectedModel: 'missing' }), available);
    assert.equal(await modelValue(page).textContent(), 'Select an option');
    await page.evaluate(() => { window.events = []; window.mount({ key: 'default-late', models: [], defaultSelectedModel: 'y' }); });
    await page.evaluate((props) => window.mount({ ...props, key: 'default-late', defaultSelectedModel: 'y' }), available);
    assert.equal(await modelValue(page).textContent(), 'Other model');
    assert.deepEqual(await modelEvents(), []);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await server.close(); }
});
