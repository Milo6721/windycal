// Small line icons for the three macros: a chicken leg, oats, an avocado.
const PATHS = {
  protein: '<ellipse cx="14.6" cy="9.4" rx="5.6" ry="4.4" transform="rotate(-45 14.6 9.4)"/><path d="M10.7 13.3l-3.9 3.9"/><circle cx="5.4" cy="17" r="1.5"/><circle cx="7" cy="18.6" r="1.5"/>',
  carbs: '<path d="M12 21V9"/><path d="M12 9c1.2-1.8 1.2-3.8 0-6-1.2 2.2-1.2 4.2 0 6z"/><path d="M12 13c-2.6 0-4.2-1.5-4.2-4.2 2.6 0 4.2 1.5 4.2 4.2z"/><path d="M12 13c2.6 0 4.2-1.5 4.2-4.2-2.6 0-4.2 1.5-4.2 4.2z"/><path d="M12 18c-2.6 0-4.2-1.5-4.2-4.2 2.6 0 4.2 1.5 4.2 4.2z"/><path d="M12 18c2.6 0 4.2-1.5 4.2-4.2-2.6 0-4.2 1.5-4.2 4.2z"/>',
  fat: '<path d="M12 3c-2.2 0-3.5 1.8-3.8 4.2C7.9 9.5 6 10.8 6 14.5a6 6 0 0 0 12 0c0-3.7-1.9-5-2.2-7.3C15.5 4.8 14.2 3 12 3z"/><circle cx="12" cy="14.5" r="2.5"/>',
};
export const icon = (name, size = 16) =>
  `<svg class="mi" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name]}</svg>`;
export const MACROS = ['protein', 'carbs', 'fat'];
