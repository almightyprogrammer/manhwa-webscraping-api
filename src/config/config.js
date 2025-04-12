module.exports = {
    server: {
        port: process.env.PORT || 3000,
        startPort: 3000
    },
    puppeteer: {
        options: {
            headless: "new",
            defaultViewport: { width: 1920, height: 1080 },
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu'
            ]
        },
        navigationTimeout: 15000,
        buttonTimeout: 1000,
        networkIdleTimeout: 1000
    },
    selectors: {
        loadMoreButton: 'button.justify-center.whitespace-nowrap.rounded-md.text-sm.font-medium.ring-offset-background.transition-colors.focus-visible\\:outline-none.focus-visible\\:ring-2.focus-visible\\:ring-ring.focus-visible\\:ring-offset-2.disabled\\:pointer-events-none.disabled\\:opacity-50.\\[\\&_svg\\]\\:pointer-events-none.\\[\\&_svg\\]\\:size-4.\\[\\&_svg\\]\\:shrink-0.bg-primary.text-primary-foreground.hover\\:bg-primary\\/90.h-10.px-4.py-2.flex.flex-row.gap-2.items-center',
        gridContainer: 'div.grid.grid-cols-1.lg\\:grid-cols-2.gap-2',
        title: 'h1.text-foreground.font-bold.text-lg.line-clamp-1',
        chapters: 'span.text-muted-foreground.hidden.lg\\:flex.flex-row.text-xxs.gap-2.items-center.line-clamp-1'
    },
    urls: {
        base: 'https://reaperscans.com/comics'
    },
    blockedResources: ['image', 'stylesheet', 'font', 'media']
}; 