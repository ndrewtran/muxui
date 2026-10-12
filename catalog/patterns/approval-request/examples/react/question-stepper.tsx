import { useEffect, useRef, useState } from 'react';
import { Button, Card, Checkbox, CheckboxGroup, IconButton, RadioGroup, Text, TextField } from '@muxui/react';

// One stroke path per icon.
const icon = (path: string) => () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={path} />
  </svg>
);
const Close = icon('M6 6l12 12M18 6 6 18');
const Up = icon('m6 15 6-6 6 6');
const Down = icon('m6 9 6 6 6-6');

const questions = [
  { id: 'q1', title: 'How should the rollout be staged?', multiple: false, options: ['All at once', 'In two waves', 'Region by region'] },
  { id: 'q2', title: 'Which notices should go out?', multiple: true, options: ['Email announcement', 'In-app banner', 'Release notes'] },
  { id: 'q3', title: 'When should it start?', multiple: false, options: ['Today', 'Next Monday', 'After review'] },
];

export function ApprovalRequestQuestionStepperExample() {
  // Local presentation state only: the answers stay in memory and nothing is submitted.
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [other, setOther] = useState<Record<string, string>>({});
  const [closed, setClosed] = useState<'answered' | 'dismissed' | null>(null);
  const message = useRef<HTMLParagraphElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  // Set by actions that replace the question, so focus follows to it.
  const followFocus = useRef(false);
  const shown = useRef({ step, closed });
  const question = questions[step];
  const picked = answers[question.id] ?? [];
  const ready = picked.length > 0 || (other[question.id] ?? '').trim() !== '';
  const last = step === questions.length - 1;
  const answered = questions.filter(({ id }) => (answers[id]?.length ?? 0) > 0 || (other[id] ?? '').trim() !== '').length;
  const advance = () => {
    followFocus.current = true;
    if (last) setClosed('answered');
    else setStep(step + 1);
  };
  const restart = () => {
    followFocus.current = true;
    setStep(0);
    setAnswers({});
    setOther({});
    setClosed(null);
  };
  // Controls unmount or disable as the card changes, so focus moves to what replaces them: the message once it closes, the new question after Continue, Skip, or Start over, and the question when a pager button that held focus is disabled.
  useEffect(() => {
    const changed = shown.current.step !== step || shown.current.closed !== closed;
    shown.current = { step, closed };
    if (!changed) return;
    if (closed) message.current?.focus();
    else {
      const held = document.activeElement;
      const lost = !held || held === document.body || held.matches(':disabled');
      if (followFocus.current || lost) heading.current?.focus();
    }
    followFocus.current = false;
  }, [step, closed]);
  return (
    <section className="ask" aria-label="Approval request">
      <style>{`
        .ask {
          max-inline-size: 28rem;
          margin-inline: auto;
          padding: var(--muxui-semantic-layout-inset-xlarge) var(--muxui-semantic-layout-viewport-inset);
        }

        .ask-body {
          display: flex;
          flex-direction: column;
          gap: var(--muxui-semantic-layout-group-gap);
        }

        .ask-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: var(--muxui-semantic-layout-action-gap);
        }

        .ask-foot {
          display: flex;
          align-items: center;
          gap: var(--muxui-semantic-layout-control-gap);
        }

        .ask-pager {
          display: flex;
          align-items: center;
          gap: var(--muxui-semantic-layout-micro-gap);
          margin-inline-end: auto;
        }

        .ask-done {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: var(--muxui-semantic-layout-group-gap);
        }
      `}</style>
      <Card.Root variant="elevated">
        {closed ? (
          <div className="ask-done">
            <Text as="p" ref={message} tabIndex={-1}>{closed === 'dismissed' ? 'Request dismissed. Nothing was sent.' : `${answered === questions.length ? `All ${answered} questions` : answered === 0 ? 'No questions' : `${answered} of ${questions.length} questions`} answered. Nothing was sent.`}</Text>
            <Button variant="neutral" size="sm" onActivate={restart}>Start over</Button>
          </div>
        ) : (
          <div className="ask-body">
            <div className="ask-head">
              <Text as="h2" ref={heading} tabIndex={-1} variant="title" size="sm">{question.title}</Text>
              <IconButton aria-label="Dismiss" variant="ghost" size="sm" onActivate={() => setClosed('dismissed')}><Close /></IconButton>
            </div>
            {question.multiple ? (
              <CheckboxGroup key={question.id} aria-label={question.title} value={picked} onChange={(value) => setAnswers({ ...answers, [question.id]: value })}>
                {question.options.map((option) => <Checkbox key={option} value={option}>{option}</Checkbox>)}
              </CheckboxGroup>
            ) : (
              <RadioGroup
                key={question.id}
                aria-label={question.title}
                defaultValue={picked[0]}
                onChange={(value) => setAnswers({ ...answers, [question.id]: [value] })}
                options={question.options.map((option) => ({ value: option, label: option }))}
              />
            )}
            <TextField aria-label="Something else" placeholder="Something else" size="sm" value={other[question.id] ?? ''} onChange={(value) => setOther({ ...other, [question.id]: value })} />
            <div className="ask-foot">
              <div className="ask-pager">
                <IconButton aria-label="Previous question" variant="ghost" size="sm" disabled={step === 0} onActivate={() => setStep(step - 1)}><Up /></IconButton>
                <Text size="sm" color="muted" role="status">{step + 1}/{questions.length}</Text>
                <IconButton aria-label="Next question" variant="ghost" size="sm" disabled={last} onActivate={() => setStep(step + 1)}><Down /></IconButton>
              </div>
              <Button variant="neutral" size="sm" onActivate={advance}>Skip</Button>
              <Button size="sm" disabled={!ready} onActivate={advance}>Continue</Button>
            </div>
          </div>
        )}
      </Card.Root>
    </section>
  );
}
