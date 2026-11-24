import type { Extension } from '@gcscode/extension-api';

import ControlsView from './controls-view.svelte';
import RadioInputView from './radio-input-view.svelte';
import { DEFAULT_STATION_URL, setStationAddress } from './station-address';

export const manualControlExtension: Extension = {
  manifest: {
    id: 'gcscode.manual-control',
    displayName: 'Manual control',
    version: '0.0.0',
    description:
      'Shows the raw input of the radio the station has open, and what each input means through its profile. Reads only: it sends nothing to the station, the radio or any vehicle.',
  },
  activate(context) {
    context.subscriptions.push(
      context.host.configuration.registerConfiguration({
        key: 'gcscode.manual-control.stationUrl',
        schema: {
          type: 'string',
          format: 'uri',
          description:
            "Address of the station's WebSocket. Changing it takes effect after the page is reloaded.",
        },
        default: DEFAULT_STATION_URL,
      }),
    );

    setStationAddress(
      context.host.configuration
        .getConfiguration('gcscode.manual-control')
        .get<string>('stationUrl', DEFAULT_STATION_URL),
    );

    context.subscriptions.push(
      context.host.window.registerView({
        id: 'gcscode.manual-control.radio-input',
        component: RadioInputView,
        title: 'Radio input',
      }),
      context.host.window.registerView({
        id: 'gcscode.manual-control.controls',
        component: ControlsView,
        title: 'Controls',
      }),
    );
  },
};
