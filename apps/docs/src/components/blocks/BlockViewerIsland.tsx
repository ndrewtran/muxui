import { Button, Text, ToggleButton, ToggleButtonGroup } from '@muxui/react';
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { announce, onSiteThemeChange, setFrameTheme, siteTheme, useSiteTheme } from '../../scripts/blocks-dom.ts';
import { getView, isMode, MIN_WIDTH, setView, useView } from '../../scripts/blocks-view.ts';

export interface BlockViewerProps {
	categoryLabel: string;
	blockName: string;
	blockHref: string;
	variantName: string;
	summary: string;
	previewSrc: string;
	previewTitle: string;
	presets: readonly { key: string; width: number }[];
	fileName: string;
	lineCount: number;
	sourcePath: string;
	/** The server-highlighted source, passed as the island's `code` slot. */
	code?: ReactNode;
}

// Room beside the box for its resize handle.
const GUTTER = 24;
const COPY_FEEDBACK_MS = 1500;

const widthId = (width: 'full' | number) => (width === 'full' ? 'full' : String(width));
/** The theme the preview should show: the remembered override, else the site's. */
const previewTheme = () => getView().theme ?? siteTheme();

/**
 * One block variant's toolbar and stage: the width presets and resize handle, the preview theme, the
 * view mode, and Copy. The toolbar state is `blocks-view.ts`, which survives a move to another variant.
 */
export default function BlockViewerIsland({
	categoryLabel,
	blockName,
	blockHref,
	variantName,
	summary,
	previewSrc,
	previewTitle,
	presets,
	fileName,
	lineCount,
	sourcePath,
	code,
}: BlockViewerProps) {
	const view = useView();
	const site = useSiteTheme();
	const effectiveTheme = view.theme ?? site;
	const frameRef = useRef<HTMLDivElement>(null);
	const boxRef = useRef<HTMLDivElement>(null);
	const iframeRef = useRef<HTMLIFrameElement>(null);
	const codeBodyRef = useRef<HTMLDivElement>(null);
	const drag = useRef<{ startX: number; startWidth: number } | null>(null);
	const copyTimer = useRef<number>(undefined);
	const [frame, setFrame] = useState<{ width: number; height: number } | null>(null);
	const [dragging, setDragging] = useState(false);
	const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle');

	// A hidden frame (the Code view) measures zero; keep the last real size until it shows again.
	useEffect(() => {
		const element = frameRef.current;
		if (!element) return undefined;
		const measure = () => {
			const { clientWidth: width, clientHeight: height } = element;
			if (width && height) setFrame((previous) => (previous?.width === width && previous.height === height ? previous : { width, height }));
		};
		const observer = new ResizeObserver(measure);
		observer.observe(element);
		measure();
		return () => observer.disconnect();
	}, []);

	// The preview document follows the toolbar live. It reads the stores, not the render values, because the
	// hydration render still shows the server's defaults.
	useEffect(() => {
		if (iframeRef.current) setFrameTheme(iframeRef.current, previewTheme());
	}, [effectiveTheme]);
	// A site theme change takes the preview back to following the site.
	useEffect(() => onSiteThemeChange(() => setView({ theme: null })), []);
	useEffect(() => () => window.clearTimeout(copyTimer.current), []);

	// The iframe keeps its logical width so the block's own media and container queries see the
	// preset; a preset wider than the stage is scaled down to fit.
	const available = frame ? Math.max(MIN_WIDTH, frame.width - GUTTER) : 0;
	const logical = frame ? (view.width === 'full' ? available : Math.max(MIN_WIDTH, view.width)) : 0;
	const scale = frame ? Math.min(1, available / logical) : 1;
	const readout = frame ? `${Math.round(logical)} px${scale < 1 ? ` at ${Math.round(scale * 100)}%` : ''}` : '';
	// A width dragged between the presets leaves the group with nothing selected.
	const selectedWidth = view.width === 'full' || presets.some(({ width }) => width === view.width) ? [widthId(view.width)] : [];

	const resizeTo = (outer: number) => {
		if (frame) setView({ width: Math.round(Math.min(available, Math.max(MIN_WIDTH, outer))) });
	};

	function startDrag(event: PointerEvent<HTMLDivElement>) {
		if (event.button !== 0 || !boxRef.current) return;
		event.preventDefault();
		event.currentTarget.focus();
		event.currentTarget.setPointerCapture(event.pointerId);
		drag.current = { startX: event.clientX, startWidth: boxRef.current.getBoundingClientRect().width };
		setDragging(true);
	}

	function moveDrag(event: PointerEvent<HTMLDivElement>) {
		if (drag.current) resizeTo(drag.current.startWidth + event.clientX - drag.current.startX);
	}

	function endDrag() {
		drag.current = null;
		setDragging(false);
	}

	function resizeFromKeyboard(event: KeyboardEvent<HTMLDivElement>) {
		const step = event.shiftKey ? 64 : 16;
		const current = boxRef.current?.getBoundingClientRect().width ?? logical;
		if (event.key === 'ArrowLeft') resizeTo(current - step);
		else if (event.key === 'ArrowRight') resizeTo(current + step);
		else if (event.key === 'Home') resizeTo(MIN_WIDTH);
		else if (event.key === 'End') setView({ width: 'full' });
		else return;
		event.preventDefault();
	}

	async function copySource() {
		// The rendered code's text is the exact example source, so it is what is copied.
		let copied = true;
		try {
			await navigator.clipboard.writeText(codeBodyRef.current?.querySelector('code')?.textContent ?? '');
		} catch {
			copied = false;
		}
		setCopy(copied ? 'copied' : 'failed');
		announce(copied ? 'Code copied to clipboard' : 'Copy failed');
		window.clearTimeout(copyTimer.current);
		copyTimer.current = window.setTimeout(() => setCopy('idle'), COPY_FEEDBACK_MS);
	}

	// Width and theme only apply while the preview is visible.
	const previewHidden = view.mode === 'code';

	return (
		<>
			<div className="blocks-bar">
				<div className="blocks-title">
					<nav aria-label="Breadcrumb">
						<ol className="blocks-crumbs">
							<li><Text variant="title" size="sm" color="muted">{categoryLabel}</Text></li>
							<li><Text variant="title" size="sm"><a href={blockHref}>{blockName}</a></Text></li>
							<li><Text as="h1" variant="title" size="sm">{variantName}</Text></li>
						</ol>
					</nav>
					<Text as="p" size="xs" color="muted">{summary}</Text>
				</div>
				<div className="blocks-tools">
					<div className="blocks-width">
						<ToggleButtonGroup
							aria-label="Preview width"
							size="sm"
							disallowEmptySelection
							disabled={previewHidden}
							selectedIds={selectedWidth}
							onSelectionChange={(ids) => {
								const id = ids[0];
								if (id !== undefined) setView({ width: id === 'full' ? 'full' : Number(id) });
							}}
						>
							{presets.map(({ key, width }) => <ToggleButton key={width} id={String(width)}>{key} {width}</ToggleButton>)}
							<ToggleButton id="full">Full</ToggleButton>
						</ToggleButtonGroup>
						<output className="blocks-readout" data-readout><Text variant="mono" size="xs" color="muted">{readout}</Text></output>
					</div>
					<ToggleButtonGroup
						aria-label="Preview theme"
						size="sm"
						disallowEmptySelection
						disabled={previewHidden}
						selectedIds={[effectiveTheme]}
						onSelectionChange={(ids) => {
							const id = ids[0];
							if (id === 'dark' || id === 'light') setView({ theme: id });
						}}
					>
						<ToggleButton id="dark" aria-label="Dark preview">
							<svg width="1em" height="1em" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true"><path d="M13 9.5A5.5 5.5 0 0 1 6.5 3a5.5 5.5 0 1 0 6.5 6.5Z" /></svg>
						</ToggleButton>
						<ToggleButton id="light" aria-label="Light preview">
							<svg width="1em" height="1em" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><circle cx="8" cy="8" r="3" /><path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1" /></svg>
						</ToggleButton>
					</ToggleButtonGroup>
					<ToggleButtonGroup
						aria-label="View"
						size="sm"
						disallowEmptySelection
						selectedIds={[view.mode]}
						onSelectionChange={(ids) => {
							const id = ids[0];
							if (isMode(id)) setView({ mode: id });
						}}
					>
						<ToggleButton id="preview">Preview</ToggleButton>
						<ToggleButton id="code">Code</ToggleButton>
						<ToggleButton id="split">Split</ToggleButton>
					</ToggleButtonGroup>
				</div>
			</div>

			<div className="blocks-stage" data-stage data-mode={view.mode}>
				<div className="blocks-frame" ref={frameRef} data-frame data-dragging={dragging ? '' : undefined}>
					<div className="blocks-frame-box" ref={boxRef} style={frame ? { width: logical * scale } : undefined}>
						<div className="blocks-frame-clip">
							<iframe
								id="blocks-preview"
								className="blocks-iframe"
								ref={iframeRef}
								title={previewTitle}
								src={previewSrc}
								data-iframe
								style={frame ? { width: logical, height: frame.height / scale, transform: scale < 1 ? `scale(${scale})` : 'none' } : undefined}
								onLoad={(event) => setFrameTheme(event.currentTarget, previewTheme())}
							/>
						</div>
						<div
							className="blocks-handle"
							role="separator"
							aria-orientation="vertical"
							aria-label="Resize preview"
							aria-controls="blocks-preview"
							aria-valuemin={frame ? MIN_WIDTH : undefined}
							aria-valuemax={frame ? Math.round(Math.max(available, logical)) : undefined}
							aria-valuenow={frame ? Math.round(logical) : undefined}
							aria-valuetext={frame ? `${Math.round(logical)} pixels wide` : undefined}
							tabIndex={0}
							onPointerDown={startDrag}
							onPointerMove={moveDrag}
							onPointerUp={endDrag}
							onPointerCancel={endDrag}
							onKeyDown={resizeFromKeyboard}
						><span aria-hidden="true" /></div>
					</div>
				</div>
				<section className="blocks-code" aria-label={`${fileName} source`} data-code>
					<div className="blocks-code-head">
						<Text variant="mono" size="xs">{fileName}</Text>
						<Text variant="mono" size="xs" color="muted" className="blocks-code-lines">{lineCount} {lineCount === 1 ? 'line' : 'lines'}</Text>
						<Button variant="neutral" size="sm" data-copy onActivate={() => { void copySource(); }}>
							{copy === 'copied' ? 'Copied' : copy === 'failed' ? 'Copy failed' : 'Copy'}
						</Button>
					</div>
					<div className="blocks-code-body" ref={codeBodyRef} data-code-body>{code}</div>
					<Text as="p" variant="mono" size="xs" color="muted" className="blocks-code-path" data-source-path>{sourcePath}</Text>
				</section>
			</div>
		</>
	);
}
