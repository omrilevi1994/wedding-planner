import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { wedflow } from '@/api/wedflowClient';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Phone, User } from 'lucide-react';
import { useWedding } from '@/lib/WeddingContext';

export default function VendorsView() {
  const { activeWeddingId } = useWedding();
  const { data: vendors = [], isLoading } = useQuery({
    queryKey: ['vendors', activeWeddingId],
    queryFn: () => wedflow.entities.Vendor.filter({ wedding_id: activeWeddingId }, 'name'),
    enabled: !!activeWeddingId
  });

  if (isLoading) return <div className="text-center py-8 text-muted-foreground">טוען...</div>;

  if (vendors.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>אין ספקים במערכת</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {vendors.map((vendor) => (
        <Card key={vendor.id} className="p-4 flex items-center justify-between gap-4 shadow-sm">
          {/* Right: name + contact */}
          <div className="flex-1 text-right min-w-0">
            <p className="font-semibold text-foreground">{vendor.name}</p>
            {vendor.contact_person && (
              <p className="text-sm text-muted-foreground flex items-center gap-1 justify-end mt-0.5">
                <span>{vendor.contact_person}</span>
                <User className="w-3.5 h-3.5 text-muted-foreground" />
              </p>
            )}
          </div>

          {/* Middle: category badge */}
          <Badge variant="outline" className="bg-champagne border-taupe/40 text-rose-deep text-xs flex-shrink-0">
            {vendor.category}
          </Badge>

          {/* Left: phone */}
          {vendor.phone && (
            <a
              href={`tel:${vendor.phone}`}
              dir="ltr"
              className="flex items-center gap-2 bg-sage/15 hover:bg-sage/25 text-sage-deep font-medium px-3 py-2 rounded-lg text-sm transition-colors flex-shrink-0"
            >
              <Phone className="w-4 h-4" />
              {vendor.phone}
            </a>
          )}
        </Card>
      ))}
    </div>
  );
}