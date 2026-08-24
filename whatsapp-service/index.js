/**
 * WhatsApp service entry (Baileys multi-tenant).
 * Logic lives in @cybercontrol/wa-service + @cybercontrol/wa-auth — edit packages/, not here.
 */
import { createApp } from '@cybercontrol/wa-service';

const { start } = createApp();
await start();
