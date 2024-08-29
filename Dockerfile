# Utilizar una imagen base de Node.js
FROM node:20

# Establecer el directorio de trabajo
WORKDIR /usr/src/app

# Copiar package.json y package-lock.json al directorio de trabajo
COPY package*.json ./

# Instalar dependencias
RUN npm install

# Instalar nodemon globalmente
RUN npm install -g nodemon

# Copiar el resto del código de la aplicación
COPY . .

# Dar permisos de ejecución a nodemon
RUN chmod +x /usr/src/app/node_modules/nodemon/bin/nodemon.js

# Exponer el puerto en el que se ejecutará la aplicación
EXPOSE 5080

# Comando para iniciar la aplicación
CMD ["npm", "run", "dev"]
