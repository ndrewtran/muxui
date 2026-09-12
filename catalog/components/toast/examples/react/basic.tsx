import { Button, ToastProvider, useToast } from '@muxui/react';
function Action() { const { add } = useToast(); return <Button onActivate={() => add('Saved')}>Save</Button>; }
export function BasicToastExample() { return <ToastProvider><Action /></ToastProvider>; }
