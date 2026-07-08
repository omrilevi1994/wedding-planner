import React from 'react';
import { motion } from 'framer-motion';
import { Card } from '@/components/ui/card';

export default function KPICard({ title, value, subtitle, icon: Icon, colorClass = 'from-champagne to-card' }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      whileHover={{ y: -2 }}
    >
      <Card className={`p-6 bg-gradient-to-br ${colorClass} border-0 shadow-md hover:shadow-lg transition-shadow`}>
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-muted-foreground mb-2">{title}</p>
            <p className="text-3xl font-bold text-foreground mb-1 tabular-nums truncate">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          {Icon && (
            <div className="bg-card/70 p-3 rounded-xl shrink-0 shadow-sm">
              <Icon className="w-6 h-6 text-rose-deep" />
            </div>
          )}
        </div>
      </Card>
    </motion.div>
  );
}
