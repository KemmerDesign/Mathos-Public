import katex from 'katex';
import 'katex/dist/katex.min.css';

export const renderMarkdownHTML = (content: string): string => {
  let html = content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Callouts estilo Obsidian: > [!type] Title\n> content
  const CALLOUT_COLORS: Record<string, { bg: string; border: string; icon: string }> = {
    teorema:    { bg: 'rgba(59,130,246,0.06)', border: '#3B82F6', icon: '📐' },
    definicion: { bg: 'rgba(139,92,246,0.06)', border: '#8B5CF6', icon: '📖' },
    ejemplo:    { bg: 'rgba(16,185,129,0.06)', border: '#10B981', icon: '💡' },
    warning:    { bg: 'rgba(245,158,11,0.06)', border: '#F59E0B', icon: '⚠️' },
    nota:       { bg: 'rgba(107,114,128,0.06)', border: '#6B7280', icon: '📝' },
    importante: { bg: 'rgba(239,68,68,0.06)',  border: '#EF4444', icon: '❗' },
    truco:      { bg: 'rgba(236,72,153,0.06)', border: '#EC4899', icon: '🎯' },
    ejercicio:  { bg: 'rgba(14,165,233,0.06)',  border: '#0EA5E9', icon: '✏️' },
  }
  html = html.replace(/^&gt; \[!(\w+)\](.*?)\n((?:&gt; .*\n?)*)/gm, (_, type, title, body) => {
    const colors = CALLOUT_COLORS[type.toLowerCase()] || CALLOUT_COLORS['nota']
    const titleText = title.trim() || type.charAt(0).toUpperCase() + type.slice(1)
    const bodyHtml = body.replace(/^&gt; /gm, '').trim()
    return `<div style="margin:12px 0;padding:12px 16px;background:${colors.bg};border-left:4px solid ${colors.border};border-radius:6px;font-size:13px;line-height:1.6">
      <div style="font-weight:800;margin-bottom:6px;color:${colors.border};display:flex;align-items:center;gap:6px">
        <span>${colors.icon}</span> ${titleText}
      </div>
      <div style="color:var(--sepia-text)">${bodyHtml}</div>
    </div>`
  })

  // LaTeX blocks: $$math$$
  html = html.replace(/\$\$(.*?)\$\$/gs, (_, math) => {
    try {
      return `<div style="margin: 16px 0; overflow-x: auto;" class="math-block">${katex.renderToString(math.trim(), { throwOnError: false, displayMode: true })}</div>`
    } catch {
      return `<div style="font-family: 'Cambria Math', serif; font-size: 16px; margin: 16px 0; padding: 12px; background: rgba(106,69,222,0.04); border-left: 3px solid #6A45DE; border-radius: 4px; text-align: center; color: var(--sepia-text);">${math.trim()}</div>`
    }
  })

  // LaTeX inline: $math$
  html = html.replace(/\$(.*?)\$/g, (_, math) => {
    try {
      return katex.renderToString(math, { throwOnError: false, displayMode: false })
    } catch {
      return `<span style="font-family: 'Cambria Math', serif; font-size: 14.5px; font-style: italic; color: #6A45DE; padding: 0 2px;">${math}</span>`
    }
  })

  // Wiki Links: [[Name]]
  html = html.replace(/\[\[(.*?)\]\]/g, (_, name) => {
    return `<span class="wiki-link" data-note="${name.trim()}" style="color: #0D9488; font-weight: 700; text-decoration: underline; cursor: pointer; transition: color 0.15s;">${name}</span>`
  })

  // Embedded constructs: ![[embed_id]]
  html = html.replace(/!\[\[(.*?)\]\]/g, (_, embedId) => {
    if (embedId.trim() === 'pitagoras_demo') {
      return `<div style="border: 1.5px solid var(--sepia-border); border-radius: 12px; overflow: hidden; margin: 16px 0; background: var(--sepia-bg); boxShadow: 0 4px 12px rgba(0,0,0,0.04);">
        <div style="font-size: 10px; font-weight: 800; background: var(--sepia-panel); padding: 6px 12px; border-bottom: 1px solid var(--sepia-border); color: var(--sepia-text-secondary); display: flex; align-items: center; gap: 6px;">📐 LIENZO GEOMÉTRICO DINÁMICO (GEO-MATHOS)</div>
        <iframe src="/geo?embed=true" style="width: 100%; height: 380px; border: none;"></iframe>
      </div>`
    }
    return `<div style="padding: 10px; background: #FEF2F2; border: 1px solid #FCA5A5; border-radius: 8px; margin: 12px 0; font-size: 11px; color: #991B1B;">⚠️ Recurso dinámico no encontrado: ${embedId}</div>`
  })

  // Normal Blockquotes (those not matched by Obsidian callouts)
  html = html.replace(/^> (.*?)$/gm, '<blockquote style="border-left: 4px solid var(--sepia-border); margin: 12px 0; padding-left: 16px; color: var(--sepia-text-secondary); font-style: italic;">$1</blockquote>')

  // Images
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width: 100%; border-radius: 8px; margin: 16px 0; border: 1px solid var(--sepia-border);" />')

  // External Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" style="color: #6A45DE; text-decoration: underline;">$1</a>')

  // Code Blocks & Mermaid
  html = html.replace(/```([a-zA-Z]*)\n?(.*?)```/gs, (_, lang, code) => {
    if (lang === 'mermaid') {
      // Mermaid usa el texto original desencodificado porque lo necesita así
      const decodedCode = code.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
      return `<div class="mermaid" style="display:flex; justify-content:center; margin: 16px 0; background: var(--sepia-panel); padding: 16px; border-radius: 8px;">${decodedCode}</div>`
    }
    
    let highlighted = code
      .replace(/(["'`])(.*?)\1/g, '<span style="color: #98c379;">$1$2$1</span>')
      .replace(/\b(const|let|var|function|return|if|else|for|while|import|from|export|class|interface|type|public|private|protected|new|this)\b/g, '<span style="color: #c678dd;">$1</span>')
      .replace(/\b(int|float|double|char|string|bool|void|boolean|number|any|true|false)\b/g, '<span style="color: #e5c07b;">$1</span>')
      .replace(/(\/\/.*)/g, '<span style="color: #5c6370; font-style: italic;">$1</span>');

    const langBadge = lang ? `<div style="text-align: right; font-size: 10px; color: #94A3B8; text-transform: uppercase; font-weight: bold; margin-bottom: 8px; user-select: none;">${lang}</div>` : '';
    return `<div style="background: #282c34; color: #abb2bf; padding: 12px 14px; border-radius: 8px; margin: 12px 0; overflow: hidden; position: relative; box-shadow: inset 0 2px 4px rgba(0,0,0,0.1);">${langBadge}<pre style="font-family: 'Fira Code', Consolas, monospace; font-size: 12.5px; overflow-x: auto; margin: 0; line-height: 1.5;"><code>${highlighted}</code></pre></div>`;
  })

  // Inline Code
  html = html.replace(/`([^`]+)`/g, '<code style="background: rgba(0,0,0,0.05); padding: 2px 4px; border-radius: 4px; font-family: monospace; font-size: 13px; color: #E11D48;">$1</code>')

  // Horizontal Rule
  html = html.replace(/^---$/gm, '<hr style="border: none; border-top: 1px solid var(--sepia-border); margin: 24px 0;" />')

  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>')
  html = html.replace(/^### (.*?)$/gm, '<h3 style="font-size: 14px; font-weight: bold; margin-top: 14px; margin-bottom: 6px; color: var(--sepia-text);">$1</h3>')
  html = html.replace(/^## (.*?)$/gm, '<h2 style="font-size: 16px; font-weight: bold; margin-top: 18px; margin-bottom: 8px; border-bottom: 1px solid var(--sepia-border); padding-bottom: 4px; color: var(--sepia-text);">$1</h2>')
  html = html.replace(/^# (.*?)$/gm, '<h1 style="font-size: 20px; font-weight: 800; margin-top: 0; margin-bottom: 12px; color: var(--sepia-text);">$1</h1>')

  html = html.replace(/^- (.*?)$/gm, '<li style="margin-left: 16px; list-style-type: disc; margin-bottom: 6px; line-height: 1.6;">$1</li>')
  html = html.replace(/^\d+\.\s(.*?)$/gm, '<li style="margin-left: 20px; list-style-type: decimal; margin-bottom: 6px; line-height: 1.6;">$1</li>')

  // Markdown Tables
  html = html.replace(/(?:^|\n)(\|.*\|)\n(\|[-:\s|]+\|)((?:\n\|.*\|)+)/g, (match, header, separator, body) => {
    const thead = header.split('|').slice(1, -1).map((cell: string) => `<th style="padding: 8px 12px; border-bottom: 2px solid var(--sepia-border); text-align: left; background: rgba(0,0,0,0.02);">${cell.trim()}</th>`).join('');
    const tbody = body.trim().split('\n').map((row: string) => {
      const cells = row.split('|').slice(1, -1).map((cell: string) => `<td style="padding: 8px 12px; border-bottom: 1px solid var(--sepia-border);">${cell.trim()}</td>`).join('');
      return `<tr>${cells}</tr>`;
    }).join('');
    return `\n<div style="overflow-x: auto; margin: 16px 0; border: 1px solid var(--sepia-border); border-radius: 8px;"><table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: left;"><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table></div>\n`;
  });

  html = html.split('\n\n').map(p => {
    const t = p.trim()
    if (t.startsWith('<h') || t.startsWith('<pre') || t.startsWith('<li') || t.startsWith('<div') || t.startsWith('<blockquote') || t.startsWith('<hr')) return p
    return `<p style="line-height: 1.7; margin-bottom: 12px;">${p}</p>`
  }).join('')

  return html
}
