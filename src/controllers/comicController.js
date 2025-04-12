const scraperService = require('../services/scraperService');

class ComicController {
    async getComics(req, res) {
        try {
            console.log('API request received');
            const comics = await scraperService.scrapeComics();
            
            res.json({
                success: true,
                count: comics.length,
                data: comics
            });
        } catch (error) {
            console.error('API Error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
}

module.exports = new ComicController(); 