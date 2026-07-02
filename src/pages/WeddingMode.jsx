import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CheckSquare, Map, Phone, Search } from 'lucide-react';
import WeddingDayChecklist from '../components/wedding-mode/WeddingDayChecklist';
import WeddingHallMap from '../components/wedding-mode/WeddingHallMap';
import EventDashboard from '../components/wedding-mode/EventDashboard';
import VendorsView from '../components/wedding-mode/VendorsView';
import GuestSearch from '../components/wedding-mode/GuestSearch';

export default function WeddingMode() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center py-4">
        <h1 className="text-3xl font-bold text-gray-900">💍 מוד חתונה</h1>
        <p className="text-gray-500 mt-1">ניהול אירוע בזמן אמת</p>
      </div>

      {/* Event Info Dashboard */}
      <EventDashboard />

      {/* Tabs */}
      <Tabs defaultValue="checklist" dir="rtl" className="w-full">
        <TabsList className="grid w-full grid-cols-4 h-14 text-base rounded-xl bg-amber-50 border border-amber-200">
          <TabsTrigger
            value="checklist"
            className="flex items-center gap-2 rounded-lg data-[state=active]:bg-amber-500 data-[state=active]:text-white text-base font-medium h-10"
          >
            <CheckSquare className="w-5 h-5" />
            צ'ק ליסט
          </TabsTrigger>
          <TabsTrigger
            value="map"
            className="flex items-center gap-2 rounded-lg data-[state=active]:bg-amber-500 data-[state=active]:text-white text-base font-medium h-10"
          >
            <Map className="w-5 h-5" />
            מפת האולם
          </TabsTrigger>
          <TabsTrigger
            value="vendors"
            className="flex items-center gap-2 rounded-lg data-[state=active]:bg-amber-500 data-[state=active]:text-white text-base font-medium h-10"
          >
            <Phone className="w-5 h-5" />
            ספקים
          </TabsTrigger>
          <TabsTrigger
            value="search"
            className="flex items-center gap-2 rounded-lg data-[state=active]:bg-amber-500 data-[state=active]:text-white text-base font-medium h-10"
          >
            <Search className="w-5 h-5" />
            חיפוש
          </TabsTrigger>
        </TabsList>

        <TabsContent value="checklist" className="mt-6">
          <WeddingDayChecklist />
        </TabsContent>

        <TabsContent value="map" className="mt-6">
          <WeddingHallMap />
        </TabsContent>

        <TabsContent value="vendors" className="mt-6">
          <VendorsView />
        </TabsContent>

        <TabsContent value="search" className="mt-6">
          <GuestSearch />
        </TabsContent>
      </Tabs>
    </div>
  );
}