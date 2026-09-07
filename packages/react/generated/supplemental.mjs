// @generated-from: packages/react/src/supplemental/index.mjs
// @generated-content-sha256: sha256:87e25a14ebaf93fb15a6bcf4d53fc560cdacc5cf1c967feea6cd48799fa65e54
import React from 'react';
import {
  Autocomplete as AriaAutocomplete,
  Button as AriaButton,
  CheckboxField as AriaCheckboxField,
  CheckboxButton as AriaCheckboxButton,
  Collection as AriaCollection,
  ComboBox as AriaComboBox,
  Dialog as AriaDialog,
  DialogTrigger as AriaDialogTrigger,
  FieldError as AriaFieldError,
  Group as AriaGroup,
  Header as AriaHeader,
  Heading as AriaHeading,
  Input as AriaInput,
  Label as AriaLabel,
  ListBox as AriaListBox,
  ListBoxItem as AriaListBoxItem,
  ListBoxSection as AriaListBoxSection,
  Link as AriaLink,
  Modal as AriaModal,
  ModalOverlay as AriaModalOverlay,
  Popover as AriaPopover,
  ProgressBar as AriaProgressBar,
  RadioField as AriaRadioField,
  RadioButton as AriaRadioButton,
  RadioGroupStateContext as AriaRadioGroupStateContext,
  SearchField as AriaSearchField,
  Section as AriaSection,
  Switch as AriaSwitch,
  SwitchField as AriaSwitchField,
  SwitchButton as AriaSwitchButton,
  Tag as AriaTag,
  TagGroup as AriaTagGroup,
  TagList as AriaTagList,
  Text as AriaText,
  TextArea as AriaTextArea,
  TextField as AriaTextField,
  useFilter,
} from 'react-aria-components';
import XIcon from 'lucide-react/dist/esm/icons/x.mjs';
import SearchIcon from 'lucide-react/dist/esm/icons/search.mjs';
import ChevronDownIcon from 'lucide-react/dist/esm/icons/chevron-down.mjs';
import MenuIcon from 'lucide-react/dist/esm/icons/menu.mjs';
import ChevronsUpDownIcon from 'lucide-react/dist/esm/icons/chevrons-up-down.mjs';
import ExternalLinkIcon from 'lucide-react/dist/esm/icons/external-link.mjs';
import CreditCardIcon from 'lucide-react/dist/esm/icons/credit-card.mjs';
import { normalizeChoiceControlSize, ChoiceControlSizeContext } from './choice-context.mjs';

const h = React.createElement;

function cx(...values) {
  return values.filter(Boolean).join(' ');
}

function dataState(value) {
  return value ? '' : undefined;
}

function nativePart(tag, base, props, ref, children) {
  const { className, ...rest } = props ?? {};
  const attributes = { ...rest, ref, className: cx(base, className) };
  return children === undefined ? h(tag, attributes) : h(tag, attributes, children);
}

function normalizeKeys(value) {
  if (value === 'all') return 'all';
  return value instanceof Set ? value : new Set(value ?? []);
}

function fieldText(slot, className, props, ref) {
  return h(AriaText, { ...props, ref, slot, className: cx(className, props?.className) });
}

function mappedFieldProps({ disabled, invalid, required, readOnly, ...props }) {
  return {
    ...props,
    isDisabled: disabled,
    isInvalid: invalid,
    isRequired: required,
    isReadOnly: readOnly,
  };
}

function pressHandler(onActivate) {
  return onActivate
    ? (event) => onActivate({ type: 'activate', pointerType: event?.pointerType, target: event?.target })
    : undefined;
}

/* AlertDialog */
function AlertDialogRoot({ open, defaultOpen = false, onOpenChange, children, ...props }) {
  return h(AriaDialogTrigger, {
    ...props,
    isOpen: open,
    defaultOpen,
    onOpenChange,
  }, children);
}

const AlertDialogDescription = React.forwardRef(function AlertDialogDescription({ className, ...props }, ref) {
  return h(AriaText, { ...props, ref, slot: 'description', elementType: 'p', className: cx('muxui-alert-dialog__description', className) });
});

function findAlertDialogDescriptionId(children) {
  let descriptionId;
  React.Children.forEach(children, (child) => {
    if (descriptionId || !React.isValidElement(child)) return;
    if (child.type === AlertDialogDescription) {
      if (typeof child.props.id === 'string' && child.props.id) descriptionId = child.props.id;
      return;
    }
    descriptionId = findAlertDialogDescriptionId(child.props.children);
  });
  return descriptionId;
}

const AlertDialog = {
  Root: React.forwardRef(function AlertDialogRootRef(props, ref) {
    return h(AlertDialogRoot, { ...props, ref });
  }),
  Backdrop: React.forwardRef(function AlertDialogBackdrop({ className, ...props }, ref) {
    return h(AriaModalOverlay, { ...props, ref, className: cx('muxui-alert-dialog__backdrop', className) });
  }),
  Popup: React.forwardRef(function AlertDialogPopup({ className, ...props }, ref) {
    return h(AriaModal, { ...props, ref, className: cx('muxui-alert-dialog__popup', className) });
  }),
  Content: React.forwardRef(function AlertDialogContent({ className, children, 'aria-describedby': ariaDescribedby, ...props }, ref) {
    const describedby = ariaDescribedby ?? findAlertDialogDescriptionId(children);
    return h(AriaDialog, { ...props, ref, role: 'alertdialog', 'aria-describedby': describedby, className: cx('muxui-alert-dialog__content', className) }, children);
  }),
  Title: React.forwardRef(function AlertDialogTitle({ className, ...props }, ref) {
    return h(AriaHeading, { ...props, ref, slot: 'title', className: cx('muxui-alert-dialog__title', className) });
  }),
  Description: AlertDialogDescription,
  Trigger: React.forwardRef(function AlertDialogTrigger({ disabled = false, onActivate, className, ...props }, ref) {
    return h(AriaButton, { ...props, ref, isDisabled: disabled, onPress: pressHandler(onActivate), className: cx('muxui-alert-dialog__trigger', className) });
  }),
  Actions: React.forwardRef(function AlertDialogActions({ className, ...props }, ref) {
    return nativePart('div', 'muxui-alert-dialog__actions', props, ref);
  }),
  Close: React.forwardRef(function AlertDialogClose({ disabled = false, onActivate, className, children, ...props }, ref) {
    return h(AriaButton, { ...props, ref, slot: 'close', isDisabled: disabled, onPress: pressHandler(onActivate), 'aria-label': props['aria-label'] ?? (children ? undefined : 'Close'), 'data-variant': 'ghost', 'data-tone': 'default', 'data-size': 'sm', className: cx('muxui-button', 'muxui-icon-button', 'muxui-alert-dialog__close', className) }, children ?? h(XIcon, { size: 16, 'aria-hidden': true }));
  }),
};

/* ButtonGroup */
export const ButtonGroup = React.forwardRef(function ButtonGroup({
  children,
  orientation = 'horizontal',
  attached = false,
  disabled = false,
  role = 'group',
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledby,
  className,
  ...props
}, ref) {
  const resolvedRole = role === 'presentation' || (ariaLabel || ariaLabelledby) ? role : 'presentation';
  return h(AriaGroup, {
    ...props,
    ref,
    role: resolvedRole,
    'aria-label': resolvedRole === 'presentation' ? undefined : ariaLabel,
    'aria-labelledby': resolvedRole === 'presentation' ? undefined : ariaLabelledby,
    isDisabled: disabled,
    'data-orientation': orientation === 'vertical' ? 'vertical' : 'horizontal',
    'data-attached': dataState(attached),
    className: cx('muxui-button-group', `muxui-button-group--${orientation === 'vertical' ? 'vertical' : 'horizontal'}`, attached && 'muxui-button-group--attached', className),
  }, typeof children === 'function' ? null : children);
});

/* Card */
function cardProps({ variant = 'outlined', padding = 'md', className, ...props }) {
  const safeVariant = ['elevated', 'outlined', 'filled'].includes(variant) ? variant : 'outlined';
  const safePadding = ['sm', 'md', 'lg'].includes(padding) ? padding : 'md';
  return { ...props, className: cx('muxui-card', `muxui-card--${safeVariant}`, `muxui-card--${safePadding}`, className) };
}

const Card = {
  Root: React.forwardRef(function CardRoot({ variant, padding, ...props }, ref) {
    return h('div', { ...cardProps({ ...props, variant, padding }), ref });
  }),
  Button: React.forwardRef(function CardButton({ variant, padding, selected, disabled = false, pending = false, onActivate, ...props }, ref) {
    return h(AriaButton, {
      ...cardProps({ ...props, variant, padding, className: cx('muxui-card--button', props.className) }),
      ref,
      isDisabled: disabled,
      isPending: pending,
      'aria-pressed': selected,
      'data-selected': dataState(selected),
      'data-pending': dataState(pending),
      onPress: pressHandler(onActivate),
    });
  }),
  Header: React.forwardRef(function CardHeader(props, ref) { return nativePart('div', 'muxui-card__header', props, ref); }),
  Body: React.forwardRef(function CardBody(props, ref) { return nativePart('div', 'muxui-card__body', props, ref); }),
  Footer: React.forwardRef(function CardFooter(props, ref) { return nativePart('div', 'muxui-card__footer', props, ref); }),
};

/* Field compounds */
function makeCheckboxField() {
  const Root = React.forwardRef(function CheckboxFieldRoot({ checked, defaultChecked, indeterminate, onChange, name, value, disabled, invalid, required, readOnly, size = 'md', className, ...props }, ref) {
    return h(AriaCheckboxField, { ...mappedFieldProps({ disabled, invalid, required, readOnly, ...props }), ref, isSelected: checked, defaultSelected: defaultChecked, isIndeterminate: indeterminate, onChange, name, value, 'data-size': size, className: cx('muxui-checkbox-field', size !== 'md' && `muxui-checkbox-field--${size}`, className) });
  });
  const Button = React.forwardRef(function CheckboxFieldButton({ disabled, className, ...props }, ref) {
    return h(AriaCheckboxButton, { ...props, ref, isDisabled: disabled, className: cx('muxui-checkbox-field__button', className) });
  });
  const Indicator = React.forwardRef(function CheckboxFieldIndicator({ className, children, ...props }, ref) {
    return nativePart('span', 'muxui-checkbox-field__indicator', props, ref, children);
  });
  const Description = React.forwardRef(function CheckboxFieldDescription(props, ref) { return fieldText('description', 'muxui-checkbox-field__description', props, ref); });
  const Error = React.forwardRef(function CheckboxFieldError(props, ref) { return h(AriaFieldError, { ...props, ref, className: cx('muxui-checkbox-field__error', props.className) }); });
  return Object.freeze({ Root, Button, Indicator, Description, Error });
}

const RadioFieldContext = React.createContext(undefined);

function splitIds(value) {
  return typeof value === 'string' ? value.trim().split(/\s+/u).filter(Boolean) : [];
}

function makeRadioField() {
  const Root = React.forwardRef(function RadioFieldRoot({ onChange: _onChange, disabled, invalid, required, readOnly, size: sizeProp, className, ...props }, ref) {
    const inheritedSize = React.useContext(ChoiceControlSizeContext);
    const radioGroupState = React.useContext(AriaRadioGroupStateContext);
    const size = normalizeChoiceControlSize(sizeProp ?? inheritedSize, 'RadioField');
    const fallbackErrorId = React.useId();
    const inputRef = React.useRef(null);
    const [errorId, setErrorId] = React.useState(undefined);
    const effectiveInvalid = Boolean(invalid || radioGroupState?.isInvalid);
    const context = React.useMemo(() => ({ effectiveInvalid, errorId, fallbackErrorId, inputRef, setErrorId }), [effectiveInvalid, errorId, fallbackErrorId]);
    return h(RadioFieldContext.Provider, { value: context }, h(AriaRadioField, { ...mappedFieldProps({ disabled, invalid, required, readOnly, ...props }), ref, inputRef, 'data-size': size, className: cx('muxui-radio-field', size !== 'md' && `muxui-radio-field--${size}`, className) }));
  });
  const Button = React.forwardRef(function RadioFieldButton({ disabled, className, 'aria-describedby': ariaDescribedBy, 'aria-errormessage': ariaErrorMessage, ...props }, ref) {
    const field = React.useContext(RadioFieldContext);
    const priorCallerIds = React.useRef([]);
    React.useEffect(() => {
      const input = field?.inputRef.current;
      if (!input) return;
      const callerIds = splitIds(ariaDescribedBy);
      const baseIds = splitIds(input.getAttribute('aria-describedby')).filter((id) => !priorCallerIds.current.includes(id));
      const describedBy = [...new Set([...baseIds, ...callerIds])].join(' ');
      if (describedBy) input.setAttribute('aria-describedby', describedBy);
      else input.removeAttribute('aria-describedby');
      priorCallerIds.current = callerIds;
      const errorMessage = ariaErrorMessage ?? field?.errorId;
      if (errorMessage) input.setAttribute('aria-errormessage', errorMessage);
      else input.removeAttribute('aria-errormessage');
    }, [ariaDescribedBy, ariaErrorMessage, field?.errorId, field?.inputRef]);
    return h(AriaRadioButton, { ...props, ref, isDisabled: disabled, className: cx('muxui-radio-field__button', className) });
  });
  const Indicator = React.forwardRef(function RadioFieldIndicator(props, ref) { return nativePart('span', 'muxui-radio-field__indicator', props, ref); });
  const Dot = React.forwardRef(function RadioFieldDot(props, ref) { return nativePart('span', 'muxui-radio-field__dot', props, ref); });
  const Description = React.forwardRef(function RadioFieldDescription(props, ref) { return fieldText('description', 'muxui-radio-field__description', props, ref); });
  const Error = React.forwardRef(function RadioFieldError({ className, id, role, ...props }, ref) {
    const field = React.useContext(RadioFieldContext);
    const errorId = id ?? field?.fallbackErrorId;
    const effectiveInvalid = field?.effectiveInvalid;
    const setErrorId = field?.setErrorId;
    React.useEffect(() => {
      if (!effectiveInvalid || !errorId || !setErrorId) return undefined;
      setErrorId((current) => current === errorId ? current : errorId);
      return () => setErrorId((current) => current === errorId ? undefined : current);
    }, [effectiveInvalid, errorId, setErrorId]);
    if (!effectiveInvalid || !errorId) return null;
    return nativePart('span', 'muxui-radio-field__error', { ...props, id: errorId, className, role: role ?? 'alert' }, ref);
  });
  return Object.freeze({ Root, Button, Indicator, Dot, Description, Error });
}
function makeSwitchField() {
  const Root = React.forwardRef(function SwitchFieldRoot({ checked, defaultChecked, onChange, name, value, disabled, invalid, required, readOnly, className, ...props }, ref) {
    return h(AriaSwitchField, { ...mappedFieldProps({ disabled, invalid, required, readOnly, ...props }), ref, isSelected: checked, defaultSelected: defaultChecked, onChange, name, value, className: cx('muxui-switch-field', className) });
  });
  const Button = React.forwardRef(function SwitchFieldButton({ disabled, className, ...props }, ref) {
    return h(AriaSwitchButton, { ...props, ref, isDisabled: disabled, className: cx('muxui-switch-field__button', className) });
  });
  const Thumb = React.forwardRef(function SwitchFieldThumb(props, ref) { return nativePart('span', 'muxui-switch-field__thumb', props, ref); });
  const Description = React.forwardRef(function SwitchFieldDescription(props, ref) { return fieldText('description', 'muxui-switch-field__description', props, ref); });
  const Error = React.forwardRef(function SwitchFieldError(props, ref) { return h(AriaFieldError, { ...props, ref, className: cx('muxui-switch-field__error', props.className) }); });
  return Object.freeze({ Root, Button, Thumb, Description, Error });
}

export const CheckboxField = makeCheckboxField();
export const RadioField = makeRadioField();
export const SwitchField = makeSwitchField();

/* Color mode */
export const ColorModeToggle = React.forwardRef(function ColorModeToggle({
  mode,
  defaultMode,
  storageKey = 'muxui-color-mode',
  disabled = false,
  onModeChange,
  className,
  children,
  ...props
}, ref) {
  // Keep the first render deterministic so an SSR light default hydrates
  // cleanly before browser-only storage or OS preference restoration runs.
  const [internalMode, setInternalMode] = React.useState(defaultMode ?? 'light');
  React.useEffect(() => {
    let nextMode = defaultMode;
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved === 'light' || saved === 'dark') nextMode = saved;
    } catch {
      // Storage can be disabled by privacy settings; OS/default mode still works.
    }
    nextMode ??= window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    setInternalMode((previous) => previous === nextMode ? previous : nextMode);
  }, [defaultMode, storageKey]);
  const currentMode = mode ?? internalMode;
  React.useEffect(() => {
    if (typeof document !== 'undefined') document.documentElement.setAttribute('data-muxui-color-scheme', currentMode);
    try { window.localStorage.setItem(storageKey, currentMode); } catch { /* best effort */ }
  }, [currentMode, storageKey]);
  const update = (selected) => {
    const next = selected ? 'dark' : 'light';
    if (mode === undefined) setInternalMode(next);
    onModeChange?.(next);
  };
  return h(AriaSwitch, { ...props, ref, 'aria-label': props['aria-label'] ?? 'Toggle dark mode', isSelected: currentMode === 'dark', isDisabled: disabled, onChange: update, className: cx('muxui-color-mode-toggle', className), 'data-mode': currentMode }, children);
});

/* Input and TextArea */
const InputAssociationContext = React.createContext(null);

function fieldRoot(Component, rootClass) {
  return React.forwardRef(function SupplementalFieldRoot({ disabled, invalid, required, readOnly, size = 'md', className, children, ...props }, ref) {
    const [descriptionId, setDescriptionId] = React.useState(undefined);
    const [errorId, setErrorId] = React.useState(undefined);
    const association = React.useMemo(() => ({
      setDescriptionId,
      setErrorId,
      descriptionId,
      errorId,
    }), [descriptionId, errorId]);
    const renderChildren = (renderProps) => h(InputAssociationContext.Provider, { value: { ...association, invalid: Boolean(invalid || renderProps?.isInvalid) } }, typeof children === 'function' ? children(renderProps) : children);
    return h(Component, { ...mappedFieldProps({ disabled, invalid, required, readOnly, ...props }), ref, 'data-size': size, className: cx(rootClass, size !== 'md' && `${rootClass}--${size}`, className), children: renderChildren });
  });
}

function associatedFieldText(slot, className, props, ref, register) {
  const association = React.useContext(InputAssociationContext);
  const nodeRef = React.useRef(null);
  const setRef = React.useCallback((node) => {
    nodeRef.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
    register?.(node?.id);
  }, [ref, register]);
  React.useLayoutEffect(() => {
    register?.(nodeRef.current?.id);
  }, [props.id, register]);
  React.useEffect(() => {
    return () => register?.(undefined);
  }, [register]);
  return fieldText(slot, className, props, setRef);
}

const Input = {
  Root: fieldRoot(AriaTextField, 'muxui-input__root'),
  Input: React.forwardRef(function InputInput({ disabled, size = 'md', className, 'aria-describedby': ariaDescribedby, ...props }, ref) {
    const association = React.useContext(InputAssociationContext);
    const describedby = [ariaDescribedby, association?.descriptionId, association?.errorId]
      .filter(Boolean)
      .join(' ') || undefined;
    const inputProps = { ...props, ref, disabled, className: cx('muxui-input', size !== 'md' && `muxui-input--${size}`, className) };
    if (describedby !== undefined) inputProps['aria-describedby'] = describedby;
    return h(AriaInput, inputProps);
  }),
  Label: React.forwardRef(function InputLabel(props, ref) { return h(AriaLabel, { ...props, ref, className: cx('muxui-input__label', props.className) }); }),
  Description: React.forwardRef(function InputDescription(props, ref) {
    const association = React.useContext(InputAssociationContext);
    return associatedFieldText('description', 'muxui-input__description', props, ref, association?.setDescriptionId);
  }),
  Error: React.forwardRef(function InputError(props, ref) {
    const association = React.useContext(InputAssociationContext);
    return associatedFieldText('errorMessage', 'muxui-input__error', props, ref, association?.setErrorId);
  }),
};

const TextArea = {
  Root: fieldRoot(AriaTextField, 'muxui-text-area'),
  TextArea: React.forwardRef(function TextAreaInput({ disabled, className, ...props }, ref) { return h(AriaTextArea, { ...props, ref, disabled, className: cx('muxui-text-area__textarea', className) }); }),
  Label: React.forwardRef(function TextAreaLabel(props, ref) { return h(AriaLabel, { ...props, ref, className: cx('muxui-text-area__label', props.className) }); }),
  Description: React.forwardRef(function TextAreaDescription(props, ref) { return fieldText('description', 'muxui-text-area__description', props, ref); }),
  Error: React.forwardRef(function TextAreaError(props, ref) { return h(AriaFieldError, { ...props, ref, className: cx('muxui-text-area__error', props.className) }); }),
};

/* ProgressCircle */
const circleSizes = Object.freeze({ sm: [32, 3], md: [48, 4], lg: [64, 5] });
const ProgressCircleContext = React.createContext({ percentage: null, size: 'md' });
const ProgressCircle = {
  Root: React.forwardRef(function ProgressCircleRoot({ value = null, minValue = 0, maxValue = 100, size = 'md', className, children, label, ...props }, ref) {
    const normalizedValue = value == null || !Number.isFinite(value) ? null : value;
    const percentage = normalizedValue == null ? null : Math.max(0, Math.min(100, ((normalizedValue - minValue) / (maxValue - minValue || 1)) * 100));
    return h(ProgressCircleContext.Provider, { value: { percentage, size } }, h(AriaProgressBar, { ...props, ref, value: normalizedValue == null ? undefined : normalizedValue, isIndeterminate: normalizedValue == null, minValue, maxValue, label, 'data-indeterminate': percentage == null ? '' : undefined, 'data-complete': percentage === 100 ? '' : undefined, className: cx('muxui-progress-circle', size !== 'md' && `muxui-progress-circle--${size}`, className) }, children));
  }),
  Track: React.forwardRef(function ProgressCircleTrack({ className, ...props }, ref) {
    const { percentage, size } = React.useContext(ProgressCircleContext);
    const [dimension, stroke] = circleSizes[size] ?? circleSizes.md;
    const radius = (dimension - stroke) / 2;
    return h('svg', { ...props, ref, className: cx('muxui-progress-circle__track', className), viewBox: `0 0 ${dimension} ${dimension}`, fill: 'none', 'aria-hidden': true }, h('circle', { className: 'muxui-progress-circle__rail', cx: dimension / 2, cy: dimension / 2, r: radius, strokeWidth: stroke }), h('circle', { className: 'muxui-progress-circle__indicator', cx: dimension / 2, cy: dimension / 2, r: radius, strokeWidth: stroke, strokeLinecap: 'round', pathLength: 100, strokeDasharray: 100, strokeDashoffset: percentage == null ? undefined : 100 - percentage, 'data-indeterminate': percentage == null ? '' : undefined }));
  }),
  Label: React.forwardRef(function ProgressCircleLabel(props, ref) { return h(AriaLabel, { ...props, ref, className: cx('muxui-progress-circle__label', props.className) }); }),
  Value: React.forwardRef(function ProgressCircleValue({ children, ...props }, ref) { const { percentage } = React.useContext(ProgressCircleContext); return nativePart('span', 'muxui-progress-circle__value', props, ref, children ?? (percentage == null ? null : `${Math.round(percentage)}%`)); }),
};

/* InputTags */
export const InputTags = {
  Root: React.forwardRef(function InputTagsRoot({
    tagPlacement = 'inline', size = 'md', placeholder, disabled = false, invalid = false, required = false,
    value, defaultValue = [], onChange, onTagAdded, onTagRemoved, allowDuplicates = false, maxTags, validate,
    label, description, errorMessage, className,
    'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby, 'aria-describedby': ariaDescribedby,
    'aria-invalid': ariaInvalid, 'aria-required': ariaRequired, ...props
  }, ref) {
    const controlled = value !== undefined;
    const instanceId = React.useId().replace(/[^A-Za-z0-9_-]/gu, '') || 'input-tags';
    const idCounter = React.useRef(0);
    const nextId = React.useCallback(() => `tag-${idCounter.current += 1}`, []);
    const [internalEntries, setInternalEntries] = React.useState(() => defaultValue.map((labelText) => ({ id: nextId(), label: labelText })));
    const controlledEntries = React.useRef([]);
    const previousValue = React.useRef(undefined);
    const entries = React.useMemo(() => {
      if (!controlled) return internalEntries;
      if (previousValue.current === value) return controlledEntries.current;
      const oldEntries = controlledEntries.current;
      const used = new Set();
      const nextEntries = (value ?? []).map((labelText) => {
        const oldIndex = oldEntries.findIndex((entry, index) => entry.label === labelText && !used.has(index));
        if (oldIndex >= 0) {
          used.add(oldIndex);
          return oldEntries[oldIndex];
        }
        return { id: nextId(), label: labelText };
      });
      previousValue.current = value;
      controlledEntries.current = nextEntries;
      return nextEntries;
    }, [controlled, internalEntries, nextId, value]);
    const tags = entries.map((entry) => entry.label);
    const [inputValue, setInputValue] = React.useState('');
    const inputRef = React.useRef(null);
    const tagListRef = React.useRef(null);
    const updateEntries = React.useCallback((nextEntries, added, removed) => {
      if (!controlled) setInternalEntries(nextEntries);
      onChange?.(nextEntries.map((entry) => entry.label));
      if (added) onTagAdded?.(added);
      if (removed) onTagRemoved?.(removed);
    }, [controlled, onChange, onTagAdded, onTagRemoved]);
    const add = React.useCallback(() => {
      const nextTag = inputValue.trim();
      if (!nextTag || (!allowDuplicates && tags.includes(nextTag)) || (maxTags !== undefined && tags.length >= maxTags) || (validate && !validate(nextTag))) return false;
      updateEntries([...entries, { id: nextId(), label: nextTag }], nextTag);
      setInputValue('');
      return true;
    }, [allowDuplicates, entries, inputValue, maxTags, nextId, tags, updateEntries, validate]);
    const removeById = React.useCallback((id) => {
      const entry = entries.find((candidate) => candidate.id === String(id));
      if (!entry) return;
      updateEntries(entries.filter((candidate) => candidate.id !== entry.id), undefined, entry.label);
    }, [entries, updateEntries]);
    const handleTagRemove = React.useCallback((keys) => {
      [...keys].forEach((key) => removeById(key));
      if (entries.length <= keys.size) setTimeout(() => inputRef.current?.focus(), 0);
    }, [entries.length, removeById]);
    const handleTagListKeyDown = (event) => {
      if (event.key !== 'ArrowRight') return;
      const tagsInDom = tagListRef.current?.querySelectorAll('[role="row"]');
      const lastTag = tagsInDom?.[tagsInDom.length - 1];
      if (lastTag && (document.activeElement === lastTag || lastTag.contains(document.activeElement))) inputRef.current?.focus();
    };
    const tagsNode = entries.length > 0 && h('div', { ref: tagListRef, onKeyDown: handleTagListKeyDown, className: 'muxui-input-tags__tag-wrapper' }, h(AriaTagGroup, { 'aria-label': typeof label === 'string' ? label : 'Tags', onRemove: handleTagRemove, className: 'muxui-input-tags__tag-group' }, h(AriaTagList, { items: entries, className: 'muxui-input-tags__tag-list' }, (entry) => h(AriaTag, { id: entry.id, isDisabled: disabled, className: 'muxui-input-tags__tag' }, entry.label))));
    const labelId = label ? `muxui-input-tags-label-${instanceId}` : undefined;
    const descriptionId = `muxui-input-tags-description-${instanceId}`;
    const errorId = `muxui-input-tags-error-${instanceId}`;
    const supportingText = invalid && errorMessage
      ? { id: errorId, className: 'muxui-input-tags__error', children: errorMessage }
      : description
        ? { id: descriptionId, className: 'muxui-input-tags__description', children: description }
        : undefined;
    const describedby = [ariaDescribedby, supportingText?.id].filter(Boolean).join(' ') || undefined;
    const inputAriaProps = ariaLabel !== undefined
      ? { 'aria-label': ariaLabel }
      : ariaLabelledby !== undefined
        ? { 'aria-labelledby': ariaLabelledby }
        : labelId
          ? { 'aria-labelledby': labelId }
          : {};
    const handleInputKeyDown = (event) => {
      const input = event.currentTarget;
      const atStart = input.selectionStart === 0 && input.selectionEnd === 0;
      if (event.key === 'Enter') {
        event.preventDefault();
        add();
      } else if ((event.key === 'Backspace' || event.key === 'ArrowLeft') && atStart && !inputValue && entries.length > 0) {
        const tagsInDom = tagListRef.current?.querySelectorAll('[role="row"]');
        tagsInDom?.[tagsInDom.length - 1]?.focus();
      }
    };
    return h('div', { ...props, ref, className: cx('muxui-input-tags', size !== 'md' && `muxui-input-tags--${size}`, tagPlacement === 'below' && 'muxui-input-tags--below', className), 'data-disabled': dataState(disabled), 'data-invalid': dataState(invalid) }, label && h('span', { id: labelId, className: 'muxui-input-tags__label' }, label, required && h('span', { 'aria-hidden': true }, ' *')), h(AriaGroup, { isDisabled: disabled, isInvalid: invalid, 'aria-labelledby': labelId, 'aria-required': required || undefined, className: 'muxui-input-tags__group' }, tagPlacement === 'inline' && tagsNode, h(AriaInput, { ...inputAriaProps, ref: inputRef, value: inputValue, placeholder: entries.length === 0 || tagPlacement === 'below' ? placeholder : undefined, onChange: (event) => setInputValue(event.target.value), onKeyDown: handleInputKeyDown, className: 'muxui-input-tags__input', disabled, 'aria-describedby': describedby, 'aria-invalid': ariaInvalid ?? (invalid || undefined), 'aria-required': ariaRequired ?? (required || undefined) })), tagPlacement === 'below' && tagsNode ? h('div', { className: 'muxui-input-tags__tags' }, tagsNode) : null, supportingText ? h('span', { id: supportingText.id, className: supportingText.className }, supportingText.children) : null);
  }),
};

/* PaymentInput */
function cardType(digits) {
  if (/^4/u.test(digits)) return 'visa';
  if (/^5[1-5]/u.test(digits)) return 'mastercard';
  const fourDigitPrefix = Number(digits.slice(0, 4));
  if (fourDigitPrefix >= 2221 && fourDigitPrefix <= 2720) return 'mastercard';
  if (/^3[47]/u.test(digits)) return 'amex';
  if (/^(6011|65|64[4-9])/u.test(digits)) return 'discover';
  return 'unknown';
}

function formatCard(digits, type) {
  const groups = type === 'amex' ? [4, 6, 5] : [4, 4, 4, 4];
  let offset = 0;
  return groups.map((length) => { const part = digits.slice(offset, offset + length); offset += length; return part; }).filter(Boolean).join(' ');
}

const PaymentInputContext = React.createContext('unknown');

export const PaymentInput = {
  Root: React.forwardRef(function PaymentInputRoot({ value, defaultValue = '', onChange, disabled, invalid, required, readOnly, className, children, ...props }, ref) {
    const [digits, setDigits] = React.useState(String(defaultValue).replace(/\D/gu, ''));
    const controlledDigits = value === undefined ? digits : String(value).replace(/\D/gu, '');
    const setValue = (next) => { if (value === undefined) setDigits(next); onChange?.(formatCard(next, cardType(next))); };
    return h(PaymentInputContext.Provider, { value: cardType(controlledDigits) }, h(AriaTextField, { ...mappedFieldProps({ disabled, invalid, required, readOnly, ...props }), ref, value: formatCard(controlledDigits, cardType(controlledDigits)), onChange: (next) => setValue(String(next).replace(/\D/gu, '')), className: cx('muxui-payment-input', className) }, children));
  }),
  Group: React.forwardRef(function PaymentInputGroup(props, ref) { return nativePart('div', 'muxui-payment-input__group', props, ref); }),
  Input: React.forwardRef(function PaymentInputInput({ disabled, className, ...props }, ref) { return h(AriaInput, { ...props, ref, disabled, inputMode: 'numeric', className: cx('muxui-payment-input__input', className) }); }),
  Label: React.forwardRef(function PaymentInputLabel(props, ref) { return h(AriaLabel, { ...props, ref, className: cx('muxui-payment-input__label', props.className) }); }),
  Description: React.forwardRef(function PaymentInputDescription(props, ref) { return fieldText('description', 'muxui-payment-input__description', props, ref); }),
  Error: React.forwardRef(function PaymentInputError(props, ref) { return h(AriaFieldError, { ...props, ref, className: cx('muxui-payment-input__error', props.className) }); }),
  CardIcon: React.forwardRef(function PaymentInputCardIcon({ cardType: suppliedType, className, 'aria-label': _ariaLabel, ...props }, ref) { const contextType = React.useContext(PaymentInputContext); const type = suppliedType ?? contextType; return h('span', { ...props, ref, className: cx('muxui-payment-input__card-icon', className), 'data-card-type': type, 'aria-hidden': true }, h(CreditCardIcon, { size: 16, 'aria-hidden': true })); }),
};

/* MultiSelect */
const MultiSelectContext = React.createContext({ size: 'md', close: () => {} });
export const MultiSelect = {
  Root: React.forwardRef(function MultiSelectRoot({ size = 'md', label, placeholder = 'Select', description, errorMessage, disabled = false, required = false, invalid = false, items, children, selectedKeys, defaultSelectedKeys, onSelectionChange, showSearch = true, showFooter = true, onReset, onSelectAll, selectedCountFormatter, supportingText, emptyStateTitle = 'No results found', emptyStateDescription = 'Please try a different search term.', className, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby, ...props }, ref) {
    const [query, setQuery] = React.useState('');
    const [popoverWidth, setPopoverWidth] = React.useState('');
    const triggerRef = React.useRef(null);
    const generatedLabelId = React.useId();
    const labelId = label ? `muxui-multi-select-label-${generatedLabelId.replace(/[^A-Za-z0-9_-]/gu, '')}` : undefined;
    const { contains } = useFilter({ sensitivity: 'base' });
    const controlled = selectedKeys !== undefined;
    const [internalSelected, setInternalSelected] = React.useState(() => normalizeKeys(defaultSelectedKeys));
    const selected = controlled ? normalizeKeys(selectedKeys) : internalSelected;
    const allItems = React.useMemo(() => (items ? Array.from(items) : undefined), [items]);
    const updateSelection = (next) => {
      if (!controlled) setInternalSelected(normalizeKeys(next));
      onSelectionChange?.(next);
    };
    const selectedCount = selected === 'all' ? (allItems?.length ?? 0) : selected.size;
    const [open, setOpen] = React.useState(false);
    const clearSearch = () => setQuery('');
    const search = showSearch && h('div', { className: 'muxui-multi-select__search-wrapper' }, h(AriaSearchField, { 'aria-label': 'Search', value: query, onChange: setQuery, autoFocus: true, className: 'muxui-multi-select__search' }, h(SearchIcon, { className: 'muxui-multi-select__search-icon', size: 16, 'aria-hidden': true }), h(AriaInput, { placeholder: 'Search', className: 'muxui-multi-select__search-input' })));
    const empty = h('div', { className: 'muxui-multi-select__empty' }, h('p', { className: 'muxui-multi-select__empty-title' }, emptyStateTitle), h('p', { className: 'muxui-multi-select__empty-description' }, emptyStateDescription), query && h('button', { type: 'button', className: 'muxui-multi-select__empty-clear', onClick: clearSearch }, 'Clear search'));
    const footer = showFooter && h('div', { className: 'muxui-multi-select__footer' }, h('button', { type: 'button', className: 'muxui-multi-select__footer-btn', onClick: onReset }, 'Reset'), h('button', { type: 'button', className: 'muxui-multi-select__footer-btn', onClick: onSelectAll }, 'Select all'));
    const popup = h(AriaPopover, { placement: 'bottom', offset: 4, containerPadding: 0, className: cx('muxui-multi-select__popup', size !== 'md' && `muxui-multi-select__popup--${size}`), style: { width: popoverWidth || undefined } }, h(AriaDialog, { className: 'muxui-multi-select__dialog' }, h(AriaAutocomplete, { filter: contains, inputValue: query, onInputChange: setQuery }, search, h(AriaListBox, { items: allItems, selectionMode: 'multiple', selectedKeys: controlled ? selected : undefined, defaultSelectedKeys: controlled ? undefined : selected, onSelectionChange: updateSelection, 'aria-label': typeof label === 'string' ? label : 'Options', renderEmptyState: () => empty, className: cx('muxui-multi-select__listbox', size !== 'md' && `muxui-multi-select__listbox--${size}`) }, children)), footer));
    const trigger = h(AriaButton, { ref: triggerRef, isDisabled: disabled, onClick: () => setPopoverWidth(`${triggerRef.current?.getBoundingClientRect().width ?? 0}px`), className: cx('muxui-multi-select__trigger', invalid && 'muxui-multi-select__trigger--invalid'), 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby ?? (ariaLabel === undefined && labelId ? labelId : undefined), 'aria-invalid': invalid || undefined, 'aria-required': required || undefined }, h('span', { className: cx('muxui-multi-select__trigger-inner', `muxui-multi-select__trigger-inner--${size}`) }, h('span', { className: cx('muxui-multi-select__value', selectedCount ? 'muxui-multi-select__value--selected' : 'muxui-multi-select__value--placeholder') }, selectedCount ? h(React.Fragment, null, selectedCountFormatter?.(selectedCount) ?? `${selectedCount} selected`, supportingText && h('span', { className: 'muxui-multi-select__supporting-text' }, supportingText)) : placeholder), h('span', { className: 'muxui-multi-select__icon', 'aria-hidden': true }, h(ChevronDownIcon, { size: 16 }))));
    const select = h(AriaDialogTrigger, { isOpen: open, onOpenChange: setOpen }, trigger, popup);
    return h(MultiSelectContext.Provider, { value: { size, close: () => setOpen(false) } }, h('div', { ...props, ref, className: cx('muxui-multi-select', `muxui-multi-select--${size}`, className), 'data-disabled': dataState(disabled), 'data-invalid': dataState(invalid) }, label && h('span', { id: labelId, className: 'muxui-multi-select__label' }, label, required && h('span', { 'aria-hidden': true }, ' *')), select, description && !invalid && h('span', { className: 'muxui-multi-select__description' }, description), invalid && errorMessage && h('span', { className: 'muxui-multi-select__error' }, errorMessage)));
  }),
  Item: React.forwardRef(function MultiSelectItem({ disabled = false, className, children, ...props }, ref) { return h(AriaListBoxItem, { ...props, ref, isDisabled: disabled, className: cx('muxui-multi-select__item', className) }, (renderProps) => h(React.Fragment, null, h('span', { className: 'muxui-multi-select__item-check', 'aria-hidden': true }, renderProps.isSelected && h('svg', { width: 12, height: 12, viewBox: '0 0 12 12', fill: 'none' }, h('path', { d: 'M2 6L5 9L10 3', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round' }))), h('span', { className: 'muxui-multi-select__item-text' }, typeof children === 'function' ? children(renderProps) : children))); }),
  Footer: React.forwardRef(function MultiSelectFooter(props, ref) { return nativePart('div', 'muxui-multi-select__footer', props, ref); }),
  EmptyState: React.forwardRef(function MultiSelectEmptyState(props, ref) { return nativePart('div', 'muxui-multi-select__empty', props, ref); }),
};

/* TagSelect */
const TagSelectContext = React.createContext({ size: 'md' });
const EMPTY_TAG_ITEMS = Object.freeze([]);
const defaultTagSelectItemLabel = (item) => String(item.name ?? item.label ?? item.id);
export const TagSelect = {
  Root: React.forwardRef(function TagSelectRoot({ size = 'md', label, placeholder, description, errorMessage, disabled = false, required = false, invalid = false, items = EMPTY_TAG_ITEMS, children, selectedKeys: controlledKeys, defaultSelectedKeys, onSelectionChange, getItemLabel = defaultTagSelectItemLabel, className, ...props }, ref) {
    const controlled = controlledKeys !== undefined;
    const [internal, setInternal] = React.useState(() => new Set(defaultSelectedKeys ?? []));
    const keys = controlled ? controlledKeys : internal;
    const [query, setQuery] = React.useState('');
    const [popoverWidth, setPopoverWidth] = React.useState('');
    const groupRef = React.useRef(null);
    const inputRef = React.useRef(null);
    const tagButtonRefs = React.useRef([]);
    const labelId = React.useId();
    const { contains } = useFilter({ sensitivity: 'base' });
    const resolveLabel = React.useCallback((item) => getItemLabel(item), [getItemLabel]);
    const itemsById = React.useMemo(() => {
      const map = new Map();
      for (const item of items) map.set(item.id, item);
      return map;
    }, [items]);
    const selectedItems = React.useMemo(
      () => [...keys].map((key) => itemsById.get(key)).filter((item) => item !== undefined),
      [itemsById, keys],
    );
    const filtered = React.useMemo(
      () => items.filter((item) => !keys.has(item.id) && contains(resolveLabel(item), query)),
      [contains, items, keys, query, resolveLabel],
    );
    const update = React.useCallback((next) => { if (!controlled) setInternal(next); onSelectionChange?.(next); }, [controlled, onSelectionChange]);
    const handleSelectionChange = (key) => {
      if (key === null || key === undefined) return;
      update(new Set([...keys, key]));
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 0);
    };
    const handleRemove = (key) => update(new Set([...keys].filter((selectedKey) => selectedKey !== key)));
    const handleOpenChange = (isOpen) => {
      if (isOpen && groupRef.current) setPopoverWidth(`${groupRef.current.getBoundingClientRect().width}px`);
    };
    const handleInputKeyDown = (event) => {
      const atStart = event.currentTarget.selectionStart === 0 && event.currentTarget.selectionEnd === 0;
      if ((event.key === 'Backspace' || event.key === 'ArrowLeft') && atStart && !query && selectedItems.length > 0) {
        event.preventDefault();
        tagButtonRefs.current[selectedItems.length - 1]?.focus();
      }
    };
    const handleTagKeyDown = (event, key, index) => {
      if (event.key === 'Tab') return;
      event.preventDefault();
      if (event.key === ' ' || event.key === 'Enter' || event.key === 'Backspace') {
        handleRemove(key);
        if (index === 0) inputRef.current?.focus();
        else tagButtonRefs.current[index - 1]?.focus();
      } else if (event.key === 'ArrowLeft' && index > 0) {
        tagButtonRefs.current[index - 1]?.focus();
      } else if (event.key === 'ArrowRight') {
        if (index < selectedItems.length - 1) tagButtonRefs.current[index + 1]?.focus();
        else inputRef.current?.focus();
      }
    };
    const tagNodes = selectedItems.map((item, index) => h('span', { className: `muxui-tag-select__tag muxui-tag-select__tag--${size}`, key: String(item.id) }, h('span', { className: 'muxui-tag-select__tag-text' }, resolveLabel(item)), h('button', { ref: (element) => { tagButtonRefs.current[index] = element; }, type: 'button', tabIndex: -1, className: 'muxui-tag-select__tag-remove', disabled, 'aria-label': `Remove ${resolveLabel(item)}`, onClick: () => handleRemove(item.id), onKeyDown: (event) => handleTagKeyDown(event, item.id, index) }, h(XIcon, { size: 14, 'aria-hidden': true }))));
    const groupClass = cx('muxui-tag-select__group', `muxui-tag-select__group--${size}`, invalid && 'muxui-tag-select__group--invalid');
    const field = h(AriaComboBox, { inputValue: query, onInputChange: setQuery, onSelectionChange: handleSelectionChange, isDisabled: disabled, 'aria-labelledby': label ? labelId : undefined, 'aria-label': label ? undefined : 'Tags', 'aria-required': required || undefined, 'aria-invalid': invalid || undefined, allowsEmptyCollection: true, menuTrigger: 'focus', onOpenChange: handleOpenChange, className: 'muxui-tag-select__combobox' }, h(AriaGroup, { ref: groupRef, isDisabled: disabled, isInvalid: invalid, className: groupClass }, tagNodes, h(AriaInput, { ref: inputRef, placeholder: selectedItems.length === 0 ? placeholder : '', className: 'muxui-tag-select__input', onKeyDown: handleInputKeyDown })), h(AriaPopover, { placement: 'bottom start', offset: 4, containerPadding: 0, style: { width: popoverWidth || undefined }, className: 'muxui-tag-select__popup' }, h(AriaListBox, { items: filtered, className: 'muxui-tag-select__listbox' }, children)));
    return h(TagSelectContext.Provider, { value: { size } }, h('div', { ...props, ref, className: cx('muxui-tag-select', className), 'data-disabled': dataState(disabled), 'data-invalid': dataState(invalid) }, label && h('span', { id: labelId, className: 'muxui-tag-select__label' }, label, required && h('span', { 'aria-hidden': true }, ' *')), field, invalid && errorMessage ? h('span', { className: 'muxui-tag-select__error' }, errorMessage) : description ? h('span', { className: 'muxui-tag-select__description' }, description) : null));
  }),
  Item: React.forwardRef(function TagSelectItem({ disabled = false, className, ...props }, ref) { return h(AriaListBoxItem, { ...props, ref, isDisabled: disabled, className: cx('muxui-tag-select__item', className) }); }),
};

/* CommandPalette */
const CommandPaletteContext = React.createContext(null);
function useCommandPart(part) { const context = React.useContext(CommandPaletteContext); if (!context) throw new Error(`CommandPalette.${part} must be used inside CommandPalette.Root`); return context; }
const CommandPalette = {
  Root: React.forwardRef(function CommandPaletteRoot({ open, defaultOpen = false, onOpenChange, size = 'md', closeOnSelect = true, className, children, ...props }, ref) {
    const controlled = open !== undefined;
    const [internalOpen, setInternalOpen] = React.useState(defaultOpen);
    const currentOpen = controlled ? open : internalOpen;
    const setOpen = (next) => { if (!controlled) setInternalOpen(next); onOpenChange?.(next); };
    return h(CommandPaletteContext.Provider, { value: { open: currentOpen, setOpen, size, closeOnSelect } }, h('div', { ...props, ref, className: cx('muxui-command-palette', size !== 'md' && `muxui-command-palette--${size}`, className), 'data-open': dataState(currentOpen) }, children));
  }),
  Trigger: React.forwardRef(function CommandPaletteTrigger({ disabled = false, onActivate, className, ...props }, ref) { const { setOpen } = useCommandPart('Trigger'); return h(AriaButton, { ...props, ref, isDisabled: disabled, onPress: (event) => { pressHandler(onActivate)?.(event); setOpen(true); }, className: cx('muxui-command-palette__trigger', className) }); }),
  Backdrop: React.forwardRef(function CommandPaletteBackdrop({ dismissable = true, className, ...props }, ref) { const { open, setOpen } = useCommandPart('Backdrop'); return h(AriaModalOverlay, { ...props, ref, isOpen: open, onOpenChange: setOpen, isDismissable: dismissable, className: cx('muxui-command-palette__backdrop', className) }); }),
  Popup: React.forwardRef(function CommandPalettePopup({ className, children, ...props }, ref) { return h(AriaModal, { className: 'muxui-command-palette__popup' }, h(AriaDialog, { ...props, ref, className: cx('muxui-command-palette__dialog', className) }, children)); }),
  Title: React.forwardRef(function CommandPaletteTitle({ className, ...props }, ref) { return h(AriaHeading, { ...props, ref, slot: 'title', className: cx('muxui-command-palette__title', className) }); }),
  Description: React.forwardRef(function CommandPaletteDescription(props, ref) { return nativePart('p', 'muxui-command-palette__description', props, ref); }),
  Close: React.forwardRef(function CommandPaletteClose({ disabled = false, onActivate, className, children, ...props }, ref) { const { setOpen } = useCommandPart('Close'); return h(AriaButton, { ...props, ref, 'aria-label': props['aria-label'] ?? (children ? undefined : 'Close'), isDisabled: disabled, onPress: (event) => { pressHandler(onActivate)?.(event); setOpen(false); }, 'data-variant': 'ghost', 'data-tone': 'default', 'data-size': 'sm', className: cx('muxui-button', 'muxui-icon-button', 'muxui-command-palette__close', className) }, children ?? h(XIcon, { size: 16, 'aria-hidden': true })); }),
  Content: React.forwardRef(function CommandPaletteContent({ className, children, ...props }, ref) { return h('div', { ...props, ref, className: cx('muxui-command-palette__content', className) }, h(AriaAutocomplete, null, children)); }),
  SearchField: React.forwardRef(function CommandPaletteSearchField({ variant = 'inline', className, ...props }, ref) { return h(AriaSearchField, { ...props, ref, 'aria-label': props['aria-label'] ?? 'Search commands', className: cx('muxui-command-palette__search-field', `muxui-command-palette__search-field--${variant}`, className) }); }),
  Input: React.forwardRef(function CommandPaletteInput({ disabled, className, ...props }, ref) { return h(AriaInput, { ...props, ref, disabled, autoFocus: props.autoFocus ?? true, className: cx('muxui-command-palette__input', className) }); }),
  ClearButton: React.forwardRef(function CommandPaletteClearButton({ disabled = false, className, children, ...props }, ref) { return h(AriaButton, { ...props, ref, isDisabled: disabled, 'data-variant': 'ghost', 'data-tone': 'default', 'data-size': 'sm', className: cx('muxui-button', 'muxui-command-palette__clear', className) }, children ?? 'Clear'); }),
  ListBox: React.forwardRef(function CommandPaletteListBox({ className, ...props }, ref) { const { size } = useCommandPart('ListBox'); return h(AriaListBox, { ...props, ref, 'aria-label': props['aria-label'] ?? 'Command results', className: cx('muxui-command-palette__listbox', size !== 'md' && `muxui-command-palette__listbox--${size}`, className) }); }),
  Section: React.forwardRef(function CommandPaletteSection({ className, ...props }, ref) { return h(AriaListBoxSection, { ...props, ref, className: cx('muxui-command-palette__section', className) }); }),
  SectionHeader: React.forwardRef(function CommandPaletteSectionHeader(props, ref) { return h(AriaHeader, { ...props, ref, className: cx('muxui-command-palette__section-header', props.className) }); }),
  Item: React.forwardRef(function CommandPaletteItem({ id, title, description, href, disabled = false, closeOnSelect, onActivate, className, children, ...props }, ref) { const { setOpen, closeOnSelect: defaultClose } = useCommandPart('Item'); const shouldClose = closeOnSelect ?? defaultClose; return h(AriaListBoxItem, { ...props, ref, id, textValue: title ?? props.textValue, href, isDisabled: disabled, onAction: () => { onActivate?.({ id }); if (shouldClose) setOpen(false); }, className: cx('muxui-command-palette__item', className) }, children ?? h(React.Fragment, null, title && h('span', { className: 'muxui-command-palette__item-title' }, title), description && h('span', { className: 'muxui-command-palette__item-description' }, description))); }),
  Separator: React.forwardRef(function CommandPaletteSeparator(props, ref) { return nativePart('hr', 'muxui-command-palette__separator', props, ref); }),
  Collection: AriaCollection,
  ItemIcon: React.forwardRef(function CommandPaletteItemIcon(props, ref) { return nativePart('span', 'muxui-command-palette__item-icon', props, ref); }),
  ItemContent: React.forwardRef(function CommandPaletteItemContent(props, ref) { return nativePart('div', 'muxui-command-palette__item-content', props, ref); }),
  ItemTitle: React.forwardRef(function CommandPaletteItemTitle(props, ref) { return nativePart('span', 'muxui-command-palette__item-title', props, ref); }),
  ItemDescription: React.forwardRef(function CommandPaletteItemDescription(props, ref) { return nativePart('span', 'muxui-command-palette__item-description', props, ref); }),
  ItemMeta: React.forwardRef(function CommandPaletteItemMeta(props, ref) { return nativePart('span', 'muxui-command-palette__item-meta', props, ref); }),
  Shortcut: React.forwardRef(function CommandPaletteShortcut({ keys, children, 'aria-hidden': ariaHidden = true, ...props }, ref) { return nativePart('span', 'muxui-command-palette__shortcut', { ...props, 'aria-hidden': ariaHidden }, ref, keys ? keys.map((key) => h('kbd', { key, className: 'muxui-command-palette__shortcut-key' }, key)) : children); }),
  LoadMoreItem: React.forwardRef(function CommandPaletteLoadMoreItem(props, ref) { return nativePart('div', 'muxui-command-palette__load-more-item', { ...props, role: 'presentation' }, ref); }),
  Empty: React.forwardRef(function CommandPaletteEmpty(props, ref) { return nativePart('div', 'muxui-command-palette__empty', props, ref); }),
  Footer: React.forwardRef(function CommandPaletteFooter(props, ref) { return nativePart('div', 'muxui-command-palette__footer', props, ref); }),
  Chips: React.forwardRef(function CommandPaletteChips(props, ref) { return nativePart('div', 'muxui-command-palette__chips', props, ref); }),
  Chip: React.forwardRef(function CommandPaletteChip(props, ref) { return nativePart('span', 'muxui-command-palette__chip', props, ref); }),
  ChipRemove: React.forwardRef(function CommandPaletteChipRemove({ disabled = false, children, ...props }, ref) { return h('button', { ...props, ref, type: 'button', disabled, className: cx('muxui-command-palette__chip-remove', props.className) }, children ?? h(XIcon, { size: 14, 'aria-hidden': true })); }),
};

/* Header navigation */
const HeaderNav = {
  Root: React.forwardRef(function HeaderNavRoot(props, ref) { return nativePart('header', 'muxui-header-nav', props, ref); }),
  Logo: React.forwardRef(function HeaderNavLogo({ href, children, className, ...props }, ref) { return nativePart('div', 'muxui-header-nav__logo', { ...props, className }, ref, href ? h('a', { href, className: 'muxui-header-nav__logo-link' }, children) : children); }),
  NavButton: React.forwardRef(function HeaderNavButton({ href, current = false, className, ...props }, ref) { return h('a', { ...props, ref, href, className: cx('muxui-header-nav__nav-btn', current && 'muxui-header-nav__nav-btn--current', className), 'aria-current': current ? 'page' : undefined }); }),
  Actions: React.forwardRef(function HeaderNavActions(props, ref) { return nativePart('div', 'muxui-header-nav__actions', props, ref); }),
  Secondary: React.forwardRef(function HeaderNavSecondary(props, ref) { return nativePart('nav', 'muxui-header-nav__secondary', props, ref); }),
  MobileTrigger: function HeaderNavMobileTrigger({ children }) { return h(AriaDialogTrigger, null, h(AriaButton, { className: 'muxui-header-nav__mobile-trigger', 'aria-label': 'Open navigation' }, h(MenuIcon, { 'aria-hidden': true })), h(AriaModalOverlay, { className: 'muxui-header-nav__mobile-overlay' }, h(AriaModal, { className: 'muxui-header-nav__mobile-drawer' }, h(AriaDialog, { 'aria-label': 'Navigation', className: 'muxui-header-nav__mobile-dialog' }, ({ close }) => h(React.Fragment, null, h('div', { className: 'muxui-header-nav__mobile-close-row' }, h(AriaButton, { onPress: close, className: 'muxui-header-nav__mobile-close-btn', 'aria-label': 'Close navigation' }, h(XIcon, { 'aria-hidden': true }))), children))))); },
};

/* Sidebar */
const Sidebar = {
  Root: React.forwardRef(function SidebarRoot({ hideBorder = false, ...props }, ref) { return h('aside', { ...props, ref, className: cx('muxui-sidebar', hideBorder && 'muxui-sidebar--no-border', props.className) }); }),
  Header: React.forwardRef(function SidebarHeader(props, ref) { return nativePart('div', 'muxui-sidebar__header', props, ref); }),
  Search: React.forwardRef(function SidebarSearch({ placeholder = 'Search', value, onChange, className, ...props }, ref) { return nativePart('div', 'muxui-sidebar__search', { ...props, className }, ref, h(React.Fragment, null, h(SearchIcon, { className: 'muxui-sidebar__search-icon', 'aria-hidden': true }), h('input', { className: 'muxui-sidebar__search-input', placeholder, value, onChange, 'aria-label': placeholder }))); }),
  Divider: React.forwardRef(function SidebarDivider(props, ref) { return nativePart('hr', 'muxui-sidebar__divider', props, ref); }),
  NavList: React.forwardRef(function SidebarNavList(props, ref) { return nativePart('ul', 'muxui-sidebar__nav-list', props, ref); }),
  NavItem: function SidebarNavItem({ href, icon: Icon, badge, current = false, children, items, external = false }) { const link = (entry, child = false) => h(AriaLink, { href: entry.href, className: cx('muxui-sidebar__nav-link', child && 'muxui-sidebar__nav-child-link', entry.current && 'muxui-sidebar__nav-link--current'), 'aria-current': entry.current ? 'page' : undefined }, entry.label); if (items?.length) return h('li', { className: 'muxui-sidebar__nav-item' }, h('details', null, h('summary', { className: cx('muxui-sidebar__nav-link', current && 'muxui-sidebar__nav-link--current') }, Icon && h(Icon, { className: 'muxui-sidebar__nav-icon', 'aria-hidden': true }), h('span', { className: 'muxui-sidebar__nav-label' }, children), badge && h('span', { className: 'muxui-sidebar__nav-badge' }, badge), h(ChevronDownIcon, { className: 'muxui-sidebar__nav-chevron', 'aria-hidden': true })), h('ul', { className: 'muxui-sidebar__nav-children' }, items.map((entry) => h('li', { key: entry.href, className: 'muxui-sidebar__nav-item' }, link(entry, true)))))); return h('li', { className: 'muxui-sidebar__nav-item' }, h(AriaLink, { href, className: cx('muxui-sidebar__nav-link', current && 'muxui-sidebar__nav-link--current'), 'aria-current': current ? 'page' : undefined }, Icon && h(Icon, { className: 'muxui-sidebar__nav-icon', 'aria-hidden': true }), h('span', { className: 'muxui-sidebar__nav-label' }, children), badge && h('span', { className: 'muxui-sidebar__nav-badge' }, badge), external && h(ExternalLinkIcon, { className: 'muxui-sidebar__nav-external', 'aria-hidden': true }))); },
  NavButton: React.forwardRef(function SidebarNavButton({ href, icon: Icon, label, current = false, className, ...props }, ref) { return h('a', { ...props, ref, href, 'aria-label': label, className: cx('muxui-sidebar__nav-btn', current && 'muxui-sidebar__nav-btn--current', className) }, Icon && h(Icon, { className: 'muxui-sidebar__nav-btn-icon', 'aria-hidden': true }), props.children); }),
  AccountCard: React.forwardRef(function SidebarAccountCard({ name, email, avatarSrc, avatarAlt, status, className, children, ...props }, ref) { return h('div', { ...props, ref, className: cx('muxui-sidebar__account-card', className) }, h('div', { className: 'muxui-sidebar__account-avatar-wrap' }, avatarSrc ? h('img', { src: avatarSrc, alt: avatarAlt ?? name, className: 'muxui-sidebar__account-avatar' }) : h('div', { className: 'muxui-sidebar__account-avatar muxui-sidebar__account-avatar--placeholder', 'aria-hidden': true }, name?.charAt(0)), status && h('span', { className: `muxui-sidebar__account-status muxui-sidebar__account-status--${status}`, 'aria-label': status })), h('div', { className: 'muxui-sidebar__account-info' }, h('div', { className: 'muxui-sidebar__account-name' }, name), h('div', { className: 'muxui-sidebar__account-email' }, email)), h(AriaButton, { className: 'muxui-sidebar__account-trigger', 'aria-label': 'Account options' }, h(ChevronsUpDownIcon, { className: 'muxui-sidebar__account-trigger-icon', 'aria-hidden': true })), children); }),
  AccountMenu: React.forwardRef(function SidebarAccountMenu(props, ref) { return nativePart('div', 'muxui-sidebar__account-menu', props, ref); }),
  MobileTrigger: function SidebarMobileTrigger({ children, logo }) { return h(AriaDialogTrigger, null, h('header', { className: 'muxui-sidebar__mobile-header' }, logo && h('div', { className: 'muxui-sidebar__mobile-logo' }, logo), h(AriaButton, { className: 'muxui-sidebar__mobile-menu-btn', 'aria-label': 'Open navigation' }, h(MenuIcon, { 'aria-hidden': true }))), h(AriaModalOverlay, { className: 'muxui-sidebar__mobile-overlay' }, h(AriaModal, { className: 'muxui-sidebar__mobile-drawer' }, h(AriaDialog, { 'aria-label': 'Navigation', className: 'muxui-sidebar__mobile-dialog' }, ({ close }) => h(React.Fragment, null, h('div', { className: 'muxui-sidebar__mobile-close-row' }, h(AriaButton, { className: 'muxui-sidebar__mobile-close-btn', onPress: close, 'aria-label': 'Close navigation' }, h(XIcon, { 'aria-hidden': true }))), children))))); },
  FeatureCard: React.forwardRef(function SidebarFeatureCard({ title, description, dismissLabel, onDismiss, ...props }, ref) { return nativePart('div', 'muxui-sidebar__feature-card', props, ref, h(React.Fragment, null, title && h('div', { className: 'muxui-sidebar__feature-card-title' }, title), description && h('div', { className: 'muxui-sidebar__feature-card-description' }, description), props.children, onDismiss && h('button', { type: 'button', className: 'muxui-sidebar__feature-card-dismiss', onClick: onDismiss }, dismissLabel ?? 'Dismiss'))); }),
};

export { AlertDialog, Card, Input, TextArea, ProgressCircle, CommandPalette, HeaderNav, Sidebar };

export const supplementalFamilies = Object.freeze([
  'AlertDialog', 'ButtonGroup', 'Card', 'CheckboxField', 'ColorModeToggle', 'CommandPalette', 'HeaderNav', 'InputTags', 'Input', 'MultiSelect', 'PaymentInput', 'ProgressCircle', 'RadioField', 'Sidebar', 'SwitchField', 'TagSelect', 'TextArea',
]);
