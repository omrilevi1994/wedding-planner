import React, { useRef, useState, useCallback } from 'react';
import { wedflow } from '@/api/wedflowClient';
import { useQueryClient } from '@tanstack/react-query';

function getTableShape(table) {
  if (table.shape) return table.shape;
  if (table.capacity >= 20) return 'long';
  return 'circle';
}

function TableShape({ table, guests, isSelected }) {
  const seatedCount = guests
    .filter(g => g.table_id === table.id)
    .reduce((sum, g) => sum + (g.confirmed_people != null ? g.confirmed_people : (g.total_people || 1)), 0);

  const isOverflow = seatedCount > table.capacity;
  const isFull = seatedCount === table.capacity;
  const shape = getTableShape(table);

  let bgColor, borderColor;
  if (isOverflow) {
    bgColor = '#ef4444'; borderColor = '#dc2626';
  } else if (isFull) {
    bgColor = '#3b82f6'; borderColor = '#2563eb';
  } else {
    bgColor = '#d97706'; borderColor = '#b45309';
  }
  if (isSelected) borderColor = '#fbbf24';

  const label = table.iplan_number || table.name?.replace('שולחן ', '') || '';
  const countLabel = `${seatedCount}/${table.capacity}`;

  const commonStyle = {
    backgroundColor: bgColor,
    border: `${isSelected ? 3 : 2}px solid ${borderColor}`,
    color: 'white',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '11px',
    fontWeight: 'bold',
    boxShadow: isSelected ? '0 0 0 3px #fbbf24, 0 2px 6px rgba(0,0,0,0.4)' : '0 1px 3px rgba(0,0,0,0.35)',
    userSelect: 'none',
    pointerEvents: 'none',
  };

  if (shape === 'long') {
    return (
      <div style={{ ...commonStyle, width: 30, height: 80, borderRadius: 4 }} title={`${table.name}: ${countLabel}`}>
        <div>{label}</div>
        <div style={{ fontSize: 9, opacity: 0.9 }}>{countLabel}</div>
      </div>
    );
  }
  if (shape === 'square') {
    return (
      <div style={{ ...commonStyle, width: 44, height: 44, borderRadius: 6 }} title={`${table.name}: ${countLabel}`}>
        <div>{label}</div>
        <div style={{ fontSize: 9, opacity: 0.9 }}>{countLabel}</div>
      </div>
    );
  }
  // circle
  return (
    <div style={{ ...commonStyle, width: 48, height: 48, borderRadius: '50%' }} title={`${table.name}: ${countLabel}`}>
      <div>{label}</div>
      <div style={{ fontSize: 9, opacity: 0.9 }}>{countLabel}</div>
    </div>
  );
}

// Fixed default positions: columns of 4, right to left, each column bottom to top
// Column 1 (rightmost): tables 1-4, x=88, y from 80 up
// Column 2: tables 5-8, x=76
// Column 3: tables 9-12, x=64
// Column 4: tables 13-16, x=52 (skip bar center)
// Column 5: tables 17-20, x=38
// Column 6: tables 21-24, x=24
// Column 7: table 25, x=12
const COLUMN_X = [88, 76, 64, 52, 38, 24, 12];
const ROW_Y = [82, 62, 42, 22]; // bottom to top

function getDefaultPosition(index) {
  const col = Math.floor(index / 4);
  const row = index % 4;
  return {
    x: COLUMN_X[col] ?? 10,
    y: ROW_Y[row] ?? 10,
  };
}

export default function HallVisualization({ tables, guests, selectedTableId, onSelectTable }) {
  const containerRef = useRef(null);
  const queryClient = useQueryClient();

  // Local drag state (not persisted until drop)
  const [dragging, setDragging] = useState(null); // { tableId, startX, startY, origX, origY }
  const [localPositions, setLocalPositions] = useState({}); // override during drag
  const [hoveredTableId, setHoveredTableId] = useState(null);

  const getPos = useCallback((table, index) => {
    if (localPositions[table.id]) return localPositions[table.id];
    if (table.location_x != null && table.location_y != null && (table.location_x !== 0 || table.location_y !== 0)) {
      return { x: table.location_x, y: table.location_y };
    }
    return getDefaultPosition(index);
  }, [localPositions, tables.length]);

  const handleMouseDown = useCallback((e, table) => {
    e.preventDefault();
    const rect = containerRef.current.getBoundingClientRect();
    const pos = getPos(table, tables.indexOf(table));
    setDragging({
      tableId: table.id,
      startX: e.clientX,
      startY: e.clientY,
      origX: pos.x,
      origY: pos.y,
      containerW: rect.width,
      containerH: rect.height,
    });
  }, [getPos, tables]);

  const handleMouseMove = useCallback((e) => {
    if (!dragging) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dx = ((e.clientX - dragging.startX) / rect.width) * 100;
    const dy = ((e.clientY - dragging.startY) / rect.height) * 100;
    const newX = Math.min(97, Math.max(3, dragging.origX + dx));
    const newY = Math.min(97, Math.max(3, dragging.origY + dy));
    setLocalPositions(prev => ({ ...prev, [dragging.tableId]: { x: newX, y: newY } }));
  }, [dragging]);

  const handleMouseUp = useCallback(async (e) => {
    if (!dragging) return;
    const pos = localPositions[dragging.tableId];
    if (pos) {
      await wedflow.entities.Table.update(dragging.tableId, { location_x: pos.x, location_y: pos.y });
      queryClient.invalidateQueries(['tables']);
    }
    setDragging(null);
  }, [dragging, localPositions, queryClient]);

  // Touch support
  const handleTouchStart = useCallback((e, table) => {
    const touch = e.touches[0];
    const rect = containerRef.current.getBoundingClientRect();
    const pos = getPos(table, tables.indexOf(table));
    setDragging({
      tableId: table.id,
      startX: touch.clientX,
      startY: touch.clientY,
      origX: pos.x,
      origY: pos.y,
      containerW: rect.width,
      containerH: rect.height,
    });
  }, [getPos, tables]);

  const handleTouchMove = useCallback((e) => {
    if (!dragging) return;
    e.preventDefault();
    const touch = e.touches[0];
    const rect = containerRef.current.getBoundingClientRect();
    const dx = ((touch.clientX - dragging.startX) / rect.width) * 100;
    const dy = ((touch.clientY - dragging.startY) / rect.height) * 100;
    const newX = Math.min(97, Math.max(3, dragging.origX + dx));
    const newY = Math.min(97, Math.max(3, dragging.origY + dy));
    setLocalPositions(prev => ({ ...prev, [dragging.tableId]: { x: newX, y: newY } }));
  }, [dragging]);

  const handleTouchEnd = useCallback(async (e) => {
    if (!dragging) return;
    const pos = localPositions[dragging.tableId];
    if (pos) {
      await wedflow.entities.Table.update(dragging.tableId, { location_x: pos.x, location_y: pos.y });
      queryClient.invalidateQueries(['tables']);
    }
    setDragging(null);
  }, [dragging, localPositions, queryClient]);

  const handleTableClick = useCallback((tableId) => {
    if (!dragging) {
      onSelectTable && onSelectTable(tableId);
    }
  }, [dragging, onSelectTable]);

  return (
    <div
      ref={containerRef}
      dir="ltr"
      style={{
        position: 'relative',
        width: '100%',
        paddingBottom: '65%',
        backgroundColor: '#4a4a4a',
        backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 29px, rgba(255,255,255,0.04) 30px), repeating-linear-gradient(90deg, transparent, transparent 29px, rgba(255,255,255,0.04) 30px)',
        borderRadius: 12,
        border: '2px solid #333',
        overflow: 'hidden',
        cursor: dragging ? 'grabbing' : 'default',
      }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Entrance - top center */}
      <div style={{ position: 'absolute', top: 0, left: '40%', right: '40%', height: 24, backgroundColor: '#6b5a3e', borderRadius: '0 0 4px 4px', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
        <span style={{ color: '#d4af37', fontSize: 10, fontWeight: 'bold' }}>כניסה</span>
      </div>

      {/* DJ - bottom center */}
      <div style={{ position: 'absolute', bottom: 0, left: '38%', right: '38%', height: 28, backgroundColor: '#1a1a2e', border: '2px solid #6c63ff', borderRadius: '6px 6px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
        <span style={{ color: '#a78bfa', fontSize: 10, fontWeight: 'bold' }}>🎵 דיג׳יי</span>
      </div>

      {/* Bar - center of hall */}
      <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: '10%', height: '8%', backgroundColor: '#6b3a1f', border: '2px solid #8B4513', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
        <span style={{ color: '#f5c842', fontSize: 11, fontWeight: 'bold' }}>🍸 בר</span>
      </div>

      {/* Tables */}
      {tables.map((table, index) => {
        const pos = getPos(table, index);
        return (
          <div
            key={table.id}
            style={{
              position: 'absolute',
              left: `${pos.x}%`,
              top: `${pos.y}%`,
              transform: 'translate(-50%, -50%)',
              zIndex: dragging?.tableId === table.id ? 10 : 2,
              cursor: dragging?.tableId === table.id ? 'grabbing' : 'grab',
            }}
            onMouseDown={(e) => handleMouseDown(e, table)}
            onTouchStart={(e) => handleTouchStart(e, table)}
            onClick={() => handleTableClick(table.id)}
            onMouseEnter={() => setHoveredTableId(table.id)}
            onMouseLeave={() => setHoveredTableId(null)}
          >
            <TableShape
              table={table}
              guests={guests}
              isSelected={selectedTableId === table.id}
            />
            {hoveredTableId === table.id && !dragging && (
              <div style={{
                position: 'absolute',
                bottom: '100%',
                left: '50%',
                transform: 'translateX(-50%)',
                marginBottom: 4,
                backgroundColor: '#1e293b',
                color: 'white',
                fontSize: 10,
                fontWeight: 'bold',
                padding: '3px 8px',
                borderRadius: 6,
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
                zIndex: 30,
                border: '1px solid rgba(255,255,255,0.25)',
                boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
              }}>
                {table.name}
              </div>
            )}
          </div>
        );
      })}

      {/* Legend */}
      <div style={{ position: 'absolute', top: 8, left: 8, display: 'flex', flexDirection: 'column', gap: 4, backgroundColor: 'rgba(0,0,0,0.5)', padding: '6px 8px', borderRadius: 6, zIndex: 5 }}>
        {[
          { color: '#d97706', label: 'פנוי' },
          { color: '#3b82f6', label: 'מלא' },
          { color: '#ef4444', label: 'עומס' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: color }} />
            <span style={{ color: 'white', fontSize: 10 }}>{label}</span>
          </div>
        ))}
        <div style={{ marginTop: 4, borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: 4 }}>
          <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 9 }}>גרור שולחן לסידור</span>
        </div>
      </div>
    </div>
  );
}