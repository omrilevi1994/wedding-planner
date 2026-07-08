import React, { useRef, useState, useCallback, useEffect } from 'react';
import { wedflow } from '@/api/wedflowClient';
import { useQueryClient } from '@tanstack/react-query';

// Pixels the pointer must travel before a press becomes a drag. Below this,
// the gesture is treated as a plain click/tap (select only, never nudges the
// element's saved position).
const DRAG_THRESHOLD_PX = 5;
const MIN_PCT = 3;
const MAX_PCT = 97;
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

function isGuestTable(t) {
  return !t.element_type || t.element_type === 'table';
}

function getTableShape(table) {
  if (table.shape) return table.shape;
  if (table.capacity >= 20) return 'long';
  return 'circle';
}

function VenueElementShape({ table, guests, isSelected, isDragging }) {
  const shadow = isSelected
    ? '0 0 0 3px rgba(198,138,112,0.55), 0 10px 22px rgba(59,53,49,0.28)'
    : isDragging
    ? '0 14px 26px rgba(59,53,49,0.32)'
    : '0 2px 8px rgba(59,53,49,0.18)';

  if (table.element_type === 'stage') {
    return (
      <div
        title={table.name}
        style={{
          width: 128, height: 40, borderRadius: 10,
          background: 'linear-gradient(135deg, #A5674E, #C68A70)',
          border: `2px solid ${isSelected ? '#7F876C' : 'rgba(255,255,255,0.35)'}`,
          color: '#FFFDF9', display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 6, fontSize: 13, fontWeight: 700, boxShadow: shadow, userSelect: 'none',
          letterSpacing: '0.02em',
        }}
      >
        <span style={{ fontSize: 14 }} aria-hidden>🎤</span>
        <span>{table.name || 'במה'}</span>
      </div>
    );
  }

  if (table.element_type === 'bar') {
    return (
      <div
        title={table.name}
        style={{
          width: 68, height: 68, borderRadius: '50%',
          background: 'linear-gradient(135deg, #BFA89A, #7F876C)',
          border: `2px solid ${isSelected ? '#A5674E' : 'rgba(255,255,255,0.35)'}`,
          color: '#FFFDF9', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 700, boxShadow: shadow, userSelect: 'none',
        }}
      >
        <span style={{ fontSize: 16 }} aria-hidden>🍸</span>
        <span>{table.name || 'בר'}</span>
      </div>
    );
  }

  const seatedCount = guests
    .filter(g => g.table_id === table.id)
    .reduce((sum, g) => sum + (g.confirmed_people != null ? g.confirmed_people : (g.total_people || 1)), 0);

  const isOverflow = seatedCount > table.capacity;
  const isFull = seatedCount === table.capacity;
  const shape = getTableShape(table);

  // Palette mirrors the landing page's seating-chart mock: rose = has room,
  // sage = full, terracotta (destructive) = overflow.
  let bg, border, text;
  if (isOverflow) {
    bg = '#F8E3DE'; border = '#C14C3C'; text = '#8A3626';
  } else if (isFull) {
    bg = '#EEF2E6'; border = '#7F876C'; text = '#5C6349';
  } else {
    bg = '#F8EBE3'; border = '#C68A70'; text = '#8A5A42';
  }

  const label = table.iplan_number || table.name?.replace('שולחן ', '') || '';
  const countLabel = `${seatedCount}/${table.capacity}`;

  const commonStyle = {
    backgroundColor: '#FFFDF9',
    backgroundImage: `linear-gradient(135deg, ${bg}, #FFFDF9)`,
    border: `${isSelected ? 3 : 2}px solid ${isSelected ? '#A5674E' : border}`,
    color: text,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '11px',
    fontWeight: 700,
    boxShadow: shadow,
    userSelect: 'none',
  };

  if (shape === 'long') {
    return (
      <div style={{ ...commonStyle, width: 32, height: 84, borderRadius: 8 }} title={`${table.name}: ${countLabel}`}>
        <div>{label}</div>
        <div style={{ fontSize: 9, opacity: 0.85 }}>{countLabel}</div>
      </div>
    );
  }
  if (shape === 'square') {
    return (
      <div style={{ ...commonStyle, width: 46, height: 46, borderRadius: 10 }} title={`${table.name}: ${countLabel}`}>
        <div>{label}</div>
        <div style={{ fontSize: 9, opacity: 0.85 }}>{countLabel}</div>
      </div>
    );
  }
  return (
    <div style={{ ...commonStyle, width: 52, height: 52, borderRadius: '50%' }} title={`${table.name}: ${countLabel}`}>
      <div>{label}</div>
      <div style={{ fontSize: 9, opacity: 0.85 }}>{countLabel}</div>
    </div>
  );
}

// Fixed default positions for guest tables only: columns of 4, right to left.
const COLUMN_X = [88, 76, 64, 52, 38, 24, 12];
const ROW_Y = [82, 62, 42, 22];

function getDefaultPosition(index) {
  const col = Math.floor(index / 4);
  const row = index % 4;
  return { x: COLUMN_X[col] ?? 10, y: ROW_Y[row] ?? 10 };
}

export default function HallVisualization({ tables, guests, selectedTableId, onSelectTable, isEditMode = false }) {
  const containerRef = useRef(null);
  const nodeRefs = useRef({});
  const dragRef = useRef(null);
  const queryClient = useQueryClient();

  const [draggingId, setDraggingId] = useState(null);
  const [localPositions, setLocalPositions] = useState({});
  const [hoveredTableId, setHoveredTableId] = useState(null);

  const guestTables = tables.filter(isGuestTable);

  const getPos = useCallback((table) => {
    if (localPositions[table.id]) return localPositions[table.id];
    if (table.location_x != null && table.location_y != null && (table.location_x !== 0 || table.location_y !== 0)) {
      return { x: table.location_x, y: table.location_y };
    }
    if (table.element_type === 'stage') return { x: 50, y: 8 };
    if (table.element_type === 'bar') return { x: 50, y: 50 };
    return getDefaultPosition(guestTables.indexOf(table));
  }, [localPositions, guestTables]);

  const persistPosition = useCallback(async (tableId, x, y) => {
    await wedflow.entities.Table.update(tableId, { location_x: x, location_y: y });
    queryClient.invalidateQueries(['tables']);
  }, [queryClient]);

  const handlePointerMove = useCallback((e) => {
    const d = dragRef.current;
    if (!d) return;
    const dxPx = e.clientX - d.startX;
    const dyPx = e.clientY - d.startY;

    if (!d.moved) {
      if (Math.hypot(dxPx, dyPx) < DRAG_THRESHOLD_PX) return;
      d.moved = true;
      setHoveredTableId(null);
      setDraggingId(d.tableId);
      document.body.style.userSelect = 'none';
    }

    const newX = clamp(d.origX + (dxPx / d.rectWidth) * 100, MIN_PCT, MAX_PCT);
    const newY = clamp(d.origY + (dyPx / d.rectHeight) * 100, MIN_PCT, MAX_PCT);
    d.currentX = newX;
    d.currentY = newY;

    // Mutate the dragged node directly instead of going through React state on
    // every pointermove — avoids re-rendering (and re-laying-out) every other
    // table on the map for each frame of the drag.
    const node = nodeRefs.current[d.tableId];
    if (node) {
      node.style.left = `${newX}%`;
      node.style.top = `${newY}%`;
    }
  }, []);

  const endDrag = useCallback((e) => {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', endDrag);
    document.body.style.userSelect = '';

    if (d.moved) {
      setLocalPositions(prev => ({ ...prev, [d.tableId]: { x: d.currentX, y: d.currentY } }));
      setDraggingId(null);
      persistPosition(d.tableId, d.currentX, d.currentY);
    } else {
      // No meaningful movement happened: this was a click/tap, not a drag —
      // select the element and leave its saved position untouched.
      onSelectTable && onSelectTable(d.tableId);
    }
  }, [handlePointerMove, onSelectTable, persistPosition]);

  useEffect(() => () => {
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', endDrag);
    document.body.style.userSelect = '';
  }, [handlePointerMove, endDrag]);

  const handlePointerDown = useCallback((e, table) => {
    if (!isEditMode) return; // locked/view mode: clicks are handled separately, no dragging
    if (e.button !== undefined && e.button !== 0) return; // left-click / primary touch only
    e.preventDefault();
    e.stopPropagation();
    const rect = containerRef.current.getBoundingClientRect();
    const pos = getPos(table);
    dragRef.current = {
      tableId: table.id,
      startX: e.clientX,
      startY: e.clientY,
      origX: pos.x,
      origY: pos.y,
      currentX: pos.x,
      currentY: pos.y,
      rectWidth: rect.width,
      rectHeight: rect.height,
      moved: false,
    };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', endDrag);
  }, [isEditMode, getPos, handlePointerMove, endDrag]);

  const handleClick = useCallback((table) => {
    if (isEditMode) return; // in edit mode, selection happens via the drag-threshold logic on pointerup
    onSelectTable && onSelectTable(table.id);
  }, [isEditMode, onSelectTable]);

  return (
    <div
      ref={containerRef}
      dir="ltr"
      style={{
        position: 'relative',
        width: '100%',
        paddingBottom: '65%',
        background: 'linear-gradient(135deg, #F3EBDF 0%, #EFE6DA 55%, #E8DED0 100%)',
        backgroundImage:
          'linear-gradient(135deg, #F3EBDF 0%, #EFE6DA 55%, #E8DED0 100%), repeating-linear-gradient(0deg, transparent, transparent 29px, rgba(191,168,154,0.16) 30px), repeating-linear-gradient(90deg, transparent, transparent 29px, rgba(191,168,154,0.16) 30px)',
        borderRadius: 20,
        border: '1px solid rgba(191,168,154,0.5)',
        boxShadow: '0 20px 45px rgba(59,53,49,0.12)',
        overflow: 'hidden',
        cursor: draggingId ? 'grabbing' : 'default',
        outline: isEditMode ? '2px dashed rgba(198,138,112,0.55)' : 'none',
        outlineOffset: isEditMode ? -2 : 0,
      }}
    >
      {/* Entrance */}
      <div style={{
        position: 'absolute', top: 0, left: '40%', right: '40%', height: 26,
        backgroundColor: '#FFFDF9', border: '1px solid rgba(191,168,154,0.5)', borderTop: 'none',
        borderRadius: '0 0 10px 10px', display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1, boxShadow: '0 4px 10px rgba(59,53,49,0.08)',
      }}>
        <span style={{ color: '#A5674E', fontSize: 10, fontWeight: 700 }}>כניסה</span>
      </div>

      {/* DJ */}
      <div style={{
        position: 'absolute', bottom: 0, left: '38%', right: '38%', height: 28,
        backgroundColor: '#F8E8BE', border: '1px solid rgba(191,168,154,0.5)', borderBottom: 'none',
        borderRadius: '10px 10px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1,
      }}>
        <span style={{ color: '#7F876C', fontSize: 10, fontWeight: 700 }}>🎵 דיג׳יי</span>
      </div>

      {/* Draggable elements: guest tables + stage/bar venue elements */}
      {tables.map((table) => {
        const pos = getPos(table);
        const isDragging = draggingId === table.id;
        return (
          <div
            key={table.id}
            ref={(el) => { nodeRefs.current[table.id] = el; }}
            style={{
              position: 'absolute',
              left: `${pos.x}%`,
              top: `${pos.y}%`,
              transform: `translate(-50%, -50%) scale(${isDragging ? 1.06 : 1})`,
              transition: isDragging ? 'none' : 'transform 0.15s ease',
              zIndex: isDragging ? 20 : (selectedTableId === table.id ? 5 : 2),
              cursor: isEditMode ? (isDragging ? 'grabbing' : 'grab') : 'pointer',
              touchAction: 'none',
            }}
            onPointerDown={(e) => handlePointerDown(e, table)}
            onClick={() => handleClick(table)}
            onMouseEnter={() => !dragRef.current && setHoveredTableId(table.id)}
            onMouseLeave={() => setHoveredTableId(null)}
          >
            <VenueElementShape
              table={table}
              guests={guests}
              isSelected={selectedTableId === table.id}
              isDragging={isDragging}
            />
            {hoveredTableId === table.id && !draggingId && (
              <div style={{
                position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
                marginBottom: 4, backgroundColor: '#3B3531', color: '#FFFDF9', fontSize: 10, fontWeight: 700,
                padding: '3px 8px', borderRadius: 6, whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 30,
                boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
              }}>
                {table.name}
              </div>
            )}
          </div>
        );
      })}

      {/* Legend */}
      <div style={{
        position: 'absolute', top: 8, left: 8, display: 'flex', flexDirection: 'column', gap: 4,
        backgroundColor: 'rgba(255,253,249,0.9)', padding: '6px 10px', borderRadius: 10, zIndex: 5,
        boxShadow: '0 4px 12px rgba(59,53,49,0.1)',
      }}>
        {[
          { color: '#C68A70', label: 'פנוי' },
          { color: '#7F876C', label: 'מלא' },
          { color: '#C14C3C', label: 'עומס' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: color }} />
            <span style={{ color: '#3B3531', fontSize: 10, fontWeight: 600 }}>{label}</span>
          </div>
        ))}
        <div style={{ marginTop: 4, borderTop: '1px solid rgba(191,168,154,0.4)', paddingTop: 4 }}>
          <span style={{ color: '#7A7066', fontSize: 9 }}>
            {isEditMode ? 'גררו כדי לסדר, לחצו לבחירה' : 'לחצו לבחירה (הפעילו מצב עריכה כדי לגרור)'}
          </span>
        </div>
      </div>
    </div>
  );
}
