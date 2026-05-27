/**
 * Counter — operator's live desk (mock).
 * Layout: top nav + toolbar + (workstack | work card) + intake strip.
 * Designed to fit 1366×768 without page scroll.
 */

import Navbar from './Navbar';
import Toolbar from './Toolbar';
import Workstack from './Workstack';
import WorkCard from './WorkCard';
import IntakeStrip from './IntakeStrip';

export default function Counter() {
  return (
    <div className="h-screen flex flex-col bg-cc-bg text-cc-text" style={{ fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }}>
      <Navbar />
      <Toolbar />
      <div className="flex-1 min-h-0 flex overflow-hidden">
        <Workstack selectedId="p1" />
        <WorkCard />
      </div>
      <IntakeStrip />
    </div>
  );
}
