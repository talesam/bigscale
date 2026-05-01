const config = {
	content: ['./src/**/*.{html,js,svelte,ts}'],
	theme: { extend: {} },
	daisyui: {
		themes: ['light', 'dark'],
		darkTheme: 'dark',
		base: true,
		styled: true,
		utils: true,
	},
	plugins: [require('@tailwindcss/typography'), require('daisyui')]
};

module.exports = config;
