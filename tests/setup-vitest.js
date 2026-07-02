// Node < 22 has no native WebSocket; @supabase/supabase-js realtime needs one
// when the client is constructed at module load (the shim does this).
import ws from 'ws';
globalThis.WebSocket = globalThis.WebSocket || ws;
