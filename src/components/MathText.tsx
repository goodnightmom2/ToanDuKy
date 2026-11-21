import katex from 'katex';
import React from 'react';

interface MathTextProps {
  text: string;
  className?: string;
}

interface Segment {
  type: 'text' | 'inline' | 'display';
  content: string;
}

function parseMathSegments(input: string): Segment[] {
  const segments: Segment[] = [];
  const regex = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(input)) !== null) {
    if (match.index > lastIdx) {
      segments.push({type: 'text', content: input.slice(lastIdx, match.index)});
    }
    const token = match[0];
    if (token.startsWith('$$') && token.endsWith('$$')) {
      segments.push({type: 'display', content: token.slice(2, -2).trim()});
    } else {
      segments.push({type: 'inline', content: token.slice(1, -1).trim()});
    }
    lastIdx = match.index + token.length;
  }

  if (lastIdx < input.length) {
    segments.push({type: 'text', content: input.slice(lastIdx)});
  }

  return segments;
}

export const MathText: React.FC<MathTextProps> = ({text, className = ''}) => {
  const segments = React.useMemo(() => parseMathSegments(text ?? ''), [text]);

  return (
    <span className={className}>
      {segments.map((seg, idx) => {
        if (seg.type === 'text') {
          return <React.Fragment key={idx}>{seg.content}</React.Fragment>;
        }
        try {
          const html = katex.renderToString(seg.content, {
            displayMode: seg.type === 'display',
            throwOnError: false,
            strict: false,
          });
          return (
            <span
              key={idx}
              className={seg.type === 'display' ? 'block my-2 text-center overflow-x-auto' : 'inline-block align-baseline mx-0.5'}
              dangerouslySetInnerHTML={{__html: html}}
            />
          );
        } catch {
          return (
            <code key={idx} className="px-1 rounded bg-[#F7E7B8] text-[#14284A]">
              {seg.content}
            </code>
          );
        }
      })}
    </span>
  );
};
