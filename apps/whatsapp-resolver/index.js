/**
 * WhatsApp resolver entry (wwebjs LID→phone oracle).
 * Logic lives in @cybercontrol/wa-resolver — edit packages/, not here.
 */
import { createApp } from '@cybercontrol/wa-resolver';

const { start } = createApp();
await start();
