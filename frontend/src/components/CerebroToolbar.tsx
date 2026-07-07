import React from 'react';

const toolbarBtnStyle: React.CSSProperties = {
  border: '1px solid var(--sepia-border)',
  background: 'var(--sepia-bg)',
  color: 'var(--sepia-text)',
  padding: '4px 8px',
  borderRadius: 6,
  fontSize: 11,
  fontWeight: 600,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 4
}

interface CerebroToolbarProps {
  editorMode: 'write' | 'preview';
  setEditorMode: (mode: 'write' | 'preview') => void;
  showBacklinks: boolean;
  setShowBacklinks: (val: boolean) => void;
  exportNoteToPDF: () => void;
  folderColor: string;
  folderName: string;
  wrapText: (prefix: string, suffix: string) => void;
  insertText: (text: string) => void;
}

export default function CerebroToolbar({
  editorMode,
  setEditorMode,
  showBacklinks,
  setShowBacklinks,
  exportNoteToPDF,
  folderColor,
  folderName,
  wrapText,
  insertText
}: CerebroToolbarProps) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px',
      borderBottom: '1px solid var(--sepia-border)', background: 'var(--sepia-panel)', flexShrink: 0
    }}>
      <button
        onClick={() => setEditorMode('write')}
        style={{
          border: 'none', background: editorMode === 'write' ? '#EFEAFD' : 'transparent',
          color: editorMode === 'write' ? '#6A45DE' : 'var(--sepia-text)',
          padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer'
        }}
      >📝 Editar</button>
      <button
        onClick={() => setEditorMode('preview')}
        style={{
          border: 'none', background: editorMode === 'preview' ? '#EFEAFD' : 'transparent',
          color: editorMode === 'preview' ? '#6A45DE' : 'var(--sepia-text)',
          padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer'
        }}
      >📖 Vista Previa</button>
      <button
        onClick={() => setShowBacklinks(!showBacklinks)}
        style={{
          border: 'none', background: showBacklinks ? '#F0FDFA' : 'transparent',
          color: showBacklinks ? '#0D9488' : 'var(--sepia-text)',
          padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer'
        }}
      >🔗 {showBacklinks ? 'Backlinks ✓' : 'Backlinks'}</button>
      <button
        onClick={exportNoteToPDF}
        style={{
          border: 'none', background: 'transparent',
          color: 'var(--sepia-text)',
          padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer',
          marginLeft: 4
        }}
        title="Exportar a PDF con sus sub-nodos"
      >📄 Exportar PDF</button>
      <span style={{
        marginLeft: 'auto', fontSize: 10,
        background: folderColor,
        color: '#fff', padding: '2px 8px', borderRadius: 10, fontWeight: 600
      }}>{folderName}</span>
      {editorMode === 'write' && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <button onClick={() => wrapText('**', '**')} title="Negrita" style={toolbarBtnStyle}><b>B</b></button>
          <button onClick={() => wrapText('*', '*')} title="Cursiva" style={toolbarBtnStyle}><i>I</i></button>
          <button onClick={() => wrapText('\n### ', '')} title="Subtítulo" style={toolbarBtnStyle}>H3</button>
          <button onClick={() => wrapText('\n> ', '')} title="Cita" style={toolbarBtnStyle}>"" Cita</button>
          <button onClick={() => wrapText('`', '`')} title="Código" style={toolbarBtnStyle}>{'</>'}</button>
          <button onClick={() => wrapText('\n```\n', '\n```\n')} title="Bloque de Código" style={toolbarBtnStyle}>💻 Bloque</button>
          <button onClick={() => wrapText('\n- ', '')} title="Lista" style={toolbarBtnStyle}>• Lista</button>
          <button onClick={() => wrapText('\n1. ', '')} title="Lista Numerada" style={toolbarBtnStyle}>1. Lista</button>
          <button onClick={() => insertText('\n| Columna 1 | Columna 2 |\n|-----------|-----------|\n| Dato A    | Dato B    |\n')} title="Insertar Tabla" style={toolbarBtnStyle}>📊 Tabla</button>
          <div style={{ width: 1, background: 'var(--sepia-border)', margin: '0 4px' }} />
          <button onClick={() => wrapText('[', '](https://...)')} title="Enlace Web" style={toolbarBtnStyle}>🌐 Web</button>
          <button onClick={() => wrapText('![', '](https://...)')} title="Imagen" style={toolbarBtnStyle}>🖼️ Imagen</button>
          <button onClick={() => wrapText('[[', ']]')} title="Enlace Wiki" style={toolbarBtnStyle}>🔗 Nodo</button>
          <button onClick={() => wrapText('$$', '$$')} title="LaTeX Ecuación" style={toolbarBtnStyle}>∑ Math</button>
          <button onClick={() => wrapText('\n```mermaid\ngraph TD;\n    A[Inicio] --> B(Proceso);\n    B --> C{Decisión};\n    C -- Sí --> D[Fin];\n    C -- No --> B;\n```\n')} title="Diagrama Mermaid" style={toolbarBtnStyle}>🐙 Flujo</button>
          <button onClick={() => insertText('\n```grafica\n{"tipo": "funcion", "titulo": "Gráfica", "funciones": ["x*x"], "rango_x": [-5, 5]}\n```\n')} title="Insertar Gráfica" style={toolbarBtnStyle}>📈 Gráfica</button>
          <button onClick={() => insertText(' ![[pitagoras_demo]]')} title="Lienzo GeoMathos" style={toolbarBtnStyle}>📐 Geo</button>
        </div>
      )}
    </div>
  )
}
