# @gcscode/extension-sitl

SITL stub: placeholder view + `gcscode.sitl.getLocation` command, hardcoded coordinates, real telemetry pending.

Contributes a view showing the ArduPilot SITL default home coordinates (Canberra Model Aircraft Club, `-35.363261, 149.165230`), a `getLocation` command that returns the `SITL_LOCATION` constant and logs it, and an `Alt+Shift+L` keybinding bound to that command. When real telemetry lands, `src/location.ts` grows from a static constant into a live data source; the view and command consumers remain unchanged.
