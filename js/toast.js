const Toast = (() => {

  const ICONS = {
    success: 'check-circle-2',
    error:   'alert-circle',
    info:    'info',
  };

  function show(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const iconName = ICONS[type] || 'info';
    toast.innerHTML = `<i data-lucide="${iconName}"></i> ${message}`;
    container.appendChild(toast);

    // rerender luciede
    if (window.lucide) lucide.createIcons();

    const timer = setTimeout(() => dismiss(toast), duration);

    toast.addEventListener('click', () => {
      clearTimeout(timer);
      dismiss(toast);
    });

    return toast;
  }

  function dismiss(toast) {
    toast.classList.add('out');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  }

  return { show };
})();
