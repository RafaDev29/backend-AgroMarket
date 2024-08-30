const  imagesService  = require('./imagesService');  // Asegúrate de importar deleteImages

const sendImage = async (req, res) => {
  const { imageName } = req.params;

  try {
    const imageUrl = imagesService.getImageUrl(imageName);
    console.log(imageUrl);
    res.redirect(imageUrl);  // Redirige al cliente a la URL completa de la imagen
  } catch (err) {
    res.status(404).json({ status: false, message: err.message });
  }
};

const deleteImagesController = async (req, res) => {
  const { productId } = req.params;
  const { imageIds } = req.body; // Lista de IDs de las imágenes a eliminar

  try {
    const result = await imagesService.deleteImages(imageIds, productId);
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};


const listImagesController = async (req, res) => {
  const { productId } = req.params;

  try {
    const result = await imagesService.listImagesByProduct (productId);
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ status: false, message: err.message });
  }
};
module.exports = { sendImage, deleteImagesController , listImagesController };
