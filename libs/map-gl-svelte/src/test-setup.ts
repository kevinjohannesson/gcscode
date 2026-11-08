import 'maplibre-gl/dist/maplibre-gl.css';

// Keep browser tests independent of the host browser's geolocation permission
// state (as upstream's browser-test-setup does).
const queryPermission = navigator.permissions.query.bind(navigator.permissions);
Object.defineProperty(navigator.permissions, 'query', {
  value: (permissionDescriptor: PermissionDescriptor) =>
    permissionDescriptor.name === 'geolocation'
      ? Promise.resolve({ state: 'granted' } as PermissionStatus)
      : queryPermission(permissionDescriptor),
});
