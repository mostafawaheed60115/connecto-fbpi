export function Icon({ name, size = 18 }) {
  const paths = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    orders: <><path d="m21 8-9-5-9 5 9 5 9-5Z" /><path d="M3 8v9l9 5 9-5V8M12 13v9" /></>,
    warehouse: <><path d="M3 21V9l9-6 9 6v12M3 21h18M7 21v-7h10v7" /></>,
    box: <><path d="m21 8-9-5-9 5 9 5 9-5Z" /><path d="M3 8v9l9 5 9-5V8M12 13v9" /></>,
    return: <><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-2" /></>,
    report: <><path d="M4 4h16v16H4z" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
    trend: <><path d="M3 17 9 11l4 4 8-8M15 7h6v6" /></>,
    arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
    lock: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    refresh: <><path d="M20 11a8 8 0 0 0-14.5-3L3 10M3 5v5h5" /><path d="M4 13a8 8 0 0 0 14.5 3L21 14M21 19v-5h-5" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13" /></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

export function Field({ label, hint, error, children }) {
  return <label className={`field ${error ? 'field-invalid' : ''}`}><span>{label}</span>{children}{hint ? <small>{hint}</small> : null}{error ? <small className="field-error">{error}</small> : null}</label>
}

export function Panel({ title, description, actions, children, className = '' }) {
  return <section className={`panel operation-card ${className}`}><div className="panel-header"><div><h3>{title}</h3>{description ? <p>{description}</p> : null}</div>{actions}</div>{children}</section>
}

export function StatusBadge({ tone = 'neutral', children }) {
  return <span className={`status-badge ${tone}`}>{children}</span>
}

export function EmptyState({ title, message, action }) {
  return <div className="empty-state"><span className="empty-state-icon"><Icon name="box" size={20} /></span><strong>{title}</strong><p>{message}</p>{action}</div>
}

export function ErrorNotice({ error }) {
  return error ? <div className="friendly-error" role="alert"><strong>Could not complete this action</strong><span>{error.message}</span></div> : null
}

export function Modal({ title, description, onClose, children, footer, wide = false }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className={`modal-card ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}><div className="modal-header"><div><h3>{title}</h3>{description ? <p>{description}</p> : null}</div><button type="button" className="icon-button" onClick={onClose} aria-label="Close dialog"><Icon name="close" /></button></div><div className="modal-body">{children}</div>{footer ? <div className="modal-footer">{footer}</div> : null}</section></div>
}

export function DataTable({ columns, rows, rowKey, emptyTitle = 'No records found', onRowClick }) {
  if (!rows.length) return <EmptyState title={emptyTitle} message="Adjust the filters or refresh the data." />
  return <div className="table-scroll"><table className="data-table"><thead><tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={rowKey ? rowKey(row, index) : index} className={onRowClick ? 'clickable-row' : ''} onClick={onRowClick ? () => onRowClick(row) : undefined}>{columns.map((column) => <td key={column.key}>{column.render ? column.render(row, index) : row[column.key] ?? '—'}</td>)}</tr>)}</tbody></table></div>
}

export function Tabs({ items, value, onChange }) {
  return <div className="tabs" role="tablist">{items.map((item) => <button type="button" key={item.value} className={value === item.value ? 'tab active' : 'tab'} onClick={() => onChange(item.value)} role="tab" aria-selected={value === item.value}>{item.label}</button>)}</div>
}
