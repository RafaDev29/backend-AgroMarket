const { getImageUrl } = require('./imagesService');

const sendImage = async (req, res) => {
  const { imageName } = req.params;

  try {
    const imageUrl = getImageUrl(imageName);
    console.log(imageUrl)
    res.redirect(imageUrl);  // Redirige al cliente a la URL completa de la imagen
  } catch (err) {
    res.status(404).json({ status: false, message: err.message });
  }
};

module.exports = { sendImage };
