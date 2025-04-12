const panelService = require('../services/panelService');

class PanelController {
    async getPanels(req, res) {
        try {
            const { url } = req.query;
            
            if (!url) {
                return res.status(400).json({
                    success: false,
                    error: 'URL parameter is required'
                });
            }

            console.log('📡 Panel request received for:', url);
            const mergedImage = await panelService.scrapeAndMergePanels(url);

            // Set headers for file download
            res.setHeader('Content-Type', 'image/png');
            res.setHeader('Content-Disposition', 'attachment; filename=merged-panels.png');
            
            // Send the image
            res.send(mergedImage);
        } catch (error) {
            console.error('Panel Error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
}

module.exports = new PanelController(); 