import assert from 'node:assert/strict';
import test from 'node:test';
import { launchBrowser, pageShell, startServer } from './harness.mjs';
const entry=`import React from 'react';import { createRoot } from 'react-dom/client';import { flushSync } from 'react-dom';import { Message } from '/src/supplemental/message.mjs';const root=createRoot(document.querySelector('#root'));window.events=[];window.mount=(props={})=>flushSync(()=>root.render(React.createElement(Message,{author:'Assistant',streaming:true,actions:[{id:'help',label:'Helpful',onAction:()=>window.events.push('help')}],sources:[{id:'source',label:'React documentation',href:'https://react.dev/',description:'react.dev'}],followUps:[{id:'next',label:'Explain the comparison'}],onFollowUp:item=>window.events.push(item.id),...props},React.createElement('p',null,props.text??'Review the selected records before applying changes.'))));window.mount();`;
const fixture=pageShell({attributes:'data-muxui-color-scheme="light"',head:'<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/generated/styles.css"><link rel="stylesheet" href="/src/supplemental/message.css">',bodyAttributes:'style="margin:0;padding:24px;background:var(--muxui-semantic-surface-canvas)"',body:'<main><div id="root"></div></main>',entry:'/message-entry.mjs'});
test('Message keyboard disclosure, source/action/follow-up and streaming updates preserve focus and narrow layout', {timeout:120_000},async()=>{
 const server=await startServer({entries:['src/supplemental/message.mjs'],pages:{'/message.html':fixture},modules:{'/message-entry.mjs':entry}});const browser=await launchBrowser();const page=await browser.newPage({viewport:{width:390,height:700}});
 try{const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(server.url+'/message.html');const trigger=page.getByRole('button',{name:'1 source'});await trigger.focus();await page.keyboard.press('Space');assert.equal(await trigger.getAttribute('aria-expanded'),'true');assert.equal(await page.getByRole('link',{name:'React documentation'}).getAttribute('href'),'https://react.dev/');await page.keyboard.press('Tab');assert.equal(await page.getByRole('link',{name:'React documentation'}).evaluate(n=>n===document.activeElement),true);
 await page.getByRole('button',{name:'Helpful'}).focus();await page.keyboard.press('Enter');await page.getByRole('button',{name:'Explain the comparison'}).focus();await page.keyboard.press('Enter');assert.deepEqual(await page.evaluate(()=>window.events),['help','next']);const follow=page.getByRole('button',{name:'Explain the comparison'});await page.evaluate(()=>window.mount({text:'Next caller token '+ 'long'.repeat(150)}));assert.equal(await follow.evaluate(n=>n===document.activeElement),true);assert.equal(await page.getByRole('status').textContent(),'Response in progress.');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.evaluate(()=>window.mount({streaming:false}));assert.equal(await page.getByRole('status').textContent(),'');await page.emulateMedia({forcedColors:'active'});assert.deepEqual(errors,[]);
 }finally{await browser.close();await server.close();}
});

test('Candidate native controls block disabled pointer clicks, bubble checkbox activation once, and preserve caller SVG and link states', { timeout: 120_000 }, async () => {
 const controlsEntry = `
import React from 'react'; import { createRoot } from 'react-dom/client'; import { flushSync } from 'react-dom';
import { CodeBlock, PromptComposer, Message, Activity, DataDiff, Link } from '/generated/index.mjs';
const e=React.createElement; const root=createRoot(document.querySelector('#root'));
window.calls=[]; window.hostClicks=[]; window.ancestorClicks=[]; window.selectionChanges=[];
const host=family=>({onClick:event=>window.hostClicks.push([family,event.target.tagName])});
const action=(id,disabled)=>({id,label:id,disabled,onAction:()=>window.calls.push(id)});
window.mountControls=(state={})=>flushSync(()=>root.render(e('main',{onClick:event=>window.ancestorClicks.push(event.target.tagName)},
 e(CodeBlock,{...host('code'),source:'const ready = true;',filename:'ready.ts'}),
 e(PromptComposer,{...host('prompt'),value:'Ready',disabled:state.disabled??true,pending:state.pending,onSend:()=>window.calls.push('send'),onStop:()=>window.calls.push('stop'),onDictation:()=>window.calls.push('dictation'),onFilesSelected:()=>window.calls.push('files'),attachments:[{id:'file',label:'notes.txt'}],onRemoveAttachment:()=>window.calls.push('remove')}),
 e(Message,{...host('message'),actions:[action('Disabled text',true),{...action('Disabled icon',true),icon:e('span',null,'a',e('svg',{id:'action-svg',width:12,height:12}),'b')}],sources:[{id:'source',label:'Source link',href:'#source'}],defaultSourcesExpanded:true},e('p',null,'Before ',e('svg',{id:'body-svg',width:12,height:12}),' after')),
 e(Activity,{...host('activity'),label:'Checks',actions:[action('Disabled aggregate',true)],items:[{id:'one',label:'Read record',status:'failed',details:'Supplied details',actions:[action('Disabled item',true)]}]}),
 e(DataDiff,{...host('data'),label:'Changes',columns:[{id:'value',label:'Value'}],rows:[{id:'one',label:'One',kind:'added',values:{value:1}},{id:'two',label:'Two',kind:'added',values:{value:2}},{id:'locked',label:'Locked',kind:'added',disabled:true,values:{value:0}}],defaultSelectedIds:['one'],disabled:state.disabled??true,pending:state.pending,onSelectionChange:ids=>window.selectionChanges.push(ids),onApply:()=>window.calls.push('apply')}),
 e(Link,{href:'#reference'},'Reference link'))));
window.mountControls();`;
 const controlsFixture=pageShell({attributes:'data-muxui-color-scheme="light"',head:'<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/generated/styles.css">',bodyAttributes:'style="margin:0;padding:24px;background:var(--muxui-semantic-surface-canvas)"',body:'<div id="root"></div>',entry:'/native-controls-entry.mjs'});
 const server=await startServer({entries:['generated/index.mjs'],pages:{'/native-controls.html':controlsFixture},modules:{'/native-controls-entry.mjs':controlsEntry}});
 const browser=await launchBrowser(); const page=await browser.newPage({viewport:{width:800,height:1000}});
 const clickTarget=async locator=>{
  await locator.scrollIntoViewIfNeeded();
  const point=await locator.evaluate(node=>{const rect=node.getBoundingClientRect();const hit=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);return {x:rect.x+rect.width/2,y:rect.y+rect.height/2,hit:hit===node,target:hit?.tagName,rect:rect.toJSON(),pointer:getComputedStyle(node).pointerEvents};});
  assert.equal(point.hit,true,JSON.stringify(point)); await page.mouse.click(point.x,point.y);
 };
 const clear=()=>page.evaluate(()=>{window.calls=[];window.hostClicks=[];window.ancestorClicks=[];window.selectionChanges=[];});
 const blocked=async locator=>{await clear();await clickTarget(locator);assert.deepEqual(await page.evaluate(()=>[window.calls,window.hostClicks,window.ancestorClicks,window.selectionChanges]),[[],[],[],[]]);};
 try {
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>new Promise(resolve=>{window.finishCopy=resolve;})}}));
  await page.goto(server.url+'/native-controls.html');await page.locator('.muxui-data-diff').waitFor();
  await page.locator('.muxui-activity summary').click();
  assert.deepEqual(await page.locator('#body-svg, #action-svg').evaluateAll(nodes=>nodes.map(node=>getComputedStyle(node).display)),['inline','inline']);
  for(const scheme of ['light','dark']) {
   await page.evaluate(value=>document.documentElement.dataset.muxuiColorScheme=value,scheme);await page.waitForTimeout(250);
   const source=page.getByRole('link',{name:'Source link'});const reference=page.getByRole('link',{name:'Reference link'});
   await source.hover();await page.waitForTimeout(250);const hover=await source.evaluate(node=>getComputedStyle(node).color);
   await reference.hover();await page.waitForTimeout(250);assert.equal(hover,await reference.evaluate(node=>getComputedStyle(node).color));
   await source.hover();await page.mouse.down();await page.waitForTimeout(250);const pressed=await source.evaluate(node=>getComputedStyle(node).color);await page.mouse.up();
   await reference.hover();await page.mouse.down();await page.waitForTimeout(250);assert.equal(pressed,await reference.evaluate(node=>getComputedStyle(node).color));await page.mouse.up();
   await page.keyboard.press('Tab');await source.focus();assert.notEqual(await source.evaluate(node=>getComputedStyle(node).boxShadow),'none');
  }
  const disabled=page.locator('button:disabled');assert.equal(await disabled.count(),9);
  for(const button of await disabled.all()) await blocked(button);
  await clear();await page.getByRole('button',{name:'Copy code'}).click();await page.waitForFunction(()=>document.querySelector('.muxui-code-block-copy').disabled);
  // The Mux IconButton consumes its own press, so a Copy click never reaches caller handlers on the host.
  assert.deepEqual(await page.evaluate(()=>window.hostClicks),[]);await blocked(page.getByRole('button',{name:'Copy code'}));
  await page.evaluate(()=>{window.finishCopy();window.mountControls({disabled:false,pending:true});});
  // A fulfilled write re-enables Copy with the Copied feedback, so settle it before listing the disabled controls.
  await page.waitForFunction(()=>!document.querySelector('.muxui-code-block-copy').disabled);
  for(const button of await page.locator('button:disabled').all()) await blocked(button);
  await page.evaluate(()=>window.mountControls({disabled:true,pending:true}));await blocked(page.getByRole('button',{name:'Stop response'}));
  await page.evaluate(()=>window.mountControls({disabled:false}));
  const one=page.getByRole('checkbox',{name:'Select One (added)'});const all=page.getByRole('checkbox',{name:'Select all proposed changes'});
  await clear();await clickTarget(one);assert.deepEqual(await page.evaluate(()=>[window.hostClicks,window.ancestorClicks,window.selectionChanges]),[[['data','INPUT']],['INPUT'],[[]]]);
  await clear();await one.focus();await page.keyboard.press('Space');assert.deepEqual(await page.evaluate(()=>[window.hostClicks,window.ancestorClicks,window.selectionChanges]),[[['data','INPUT']],['INPUT'],[['one']]]);assert.equal(await all.evaluate(node=>node.indeterminate),true);
  await clear();await clickTarget(all);assert.deepEqual(await page.evaluate(()=>[window.hostClicks,window.ancestorClicks,window.selectionChanges]),[[['data','INPUT']],['INPUT'],[['one','two']]]);
  await clear();await all.focus();await page.keyboard.press('Space');assert.deepEqual(await page.evaluate(()=>[window.hostClicks,window.ancestorClicks,window.selectionChanges]),[[['data','INPUT']],['INPUT'],[[]]]);
  await blocked(page.getByRole('checkbox',{name:'Select Locked (added)'}));assert.deepEqual(errors,[]);
 } finally {await browser.close();await server.close();}
});
