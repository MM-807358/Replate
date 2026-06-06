const Filters = (() => {

  const chips = document.querySelectorAll('.filter-chip');

  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      const filter = chip.dataset.filter;
      Store.setActiveFilter(filter);
      chips.forEach(c => c.classList.toggle('active', c.dataset.filter === filter));
      document.dispatchEvent(new CustomEvent('filter:changed'));
    });
  });

  return {};
})();
