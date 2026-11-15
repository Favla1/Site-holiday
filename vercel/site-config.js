// Choose local API on localhost; otherwise use production API.
(() => {
    const hostname = String(window.location.hostname || '').toLowerCase();
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
    const isDiscloud = hostname.endsWith('.discloud.app') || hostname.endsWith('.discloud.dev');

    window.HOLIDAY_API_URL = isLocal || isDiscloud
        ? `${window.location.origin}/api`
        : 'https://guildaholiday.discloud.dev/api';
})();
