import type { Extension } from '@gcscode/extension-api';

import { DEFAULT_WHEP_URL, setVideoAddress } from './video-address';
import VideoPanel from './video-panel.svelte';

export const videoExtension: Extension = {
  manifest: {
    id: 'gcscode.video',
    displayName: 'Video',
    version: '0.0.0',
    description: "A panel that plays the drone camera's live video stream.",
  },
  activate(context) {
    context.subscriptions.push(
      context.host.configuration.registerConfiguration({
        key: 'gcscode.video.whepUrl',
        schema: {
          type: 'string',
          format: 'uri',
          description:
            "Address of the drone camera's live video stream. Changing it takes effect after the page is reloaded.",
        },
        default: DEFAULT_WHEP_URL,
      }),
    );

    setVideoAddress(
      context.host.configuration
        .getConfiguration('gcscode.video')
        .get<string>('whepUrl', DEFAULT_WHEP_URL),
    );

    context.subscriptions.push(
      context.host.window.registerView({
        id: 'gcscode.video.main',
        component: VideoPanel,
        title: 'Video',
      }),
    );
  },
};
