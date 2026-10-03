import { createWsBridge } from '@cybercontrol/svc-shared/ws-bridge';

export const { setWsSend, send } = createWsBridge('svc-runtime');
