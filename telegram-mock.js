// telegram-mock.js — only used for local testing, never deployed
window.Telegram = {
  WebApp: {
    ready: () => {},
    expand: () => {},
    initDataUnsafe: {
      user: { id: 12345, first_name: "TestAgent" },
      start_param: ""
    },
    openLink: (url) => { window.open(url, '_blank'); },
    openTelegramLink: (url) => { console.log("openTelegramLink:", url); },
    showAlert: (msg) => { alert(msg); },
    showPopup: (opts) => { alert(opts.message); },
    HapticFeedback: { notificationOccurred: () => {} }
  }
};