'use strict';
(function(){

var _imageEnAttente=null;
var _MAX_SIZE=5*1024*1024;
var _FORMATS=["image/jpeg","image/png","image/webp","image/gif"];

window.TilexVision={

  imageEnAttente:null,

  chargerImage:function(fichier){
    return new Promise(function(resolve,reject){
      if(!fichier){reject(new Error("Aucun fichier"));return;}
      if(_FORMATS.indexOf(fichier.type)===-1){
        reject(new Error("Format non supporté. Utilise JPG, PNG, WEBP ou GIF."));return;
      }
      if(fichier.size>_MAX_SIZE){
        reject(new Error("Image trop grosse. Maximum 5MB."));return;
      }
      var reader=new FileReader();
      reader.onload=function(e){
        var dataUrl=e.target.result;
        _imageEnAttente={
          base64:dataUrl.split(",")[1],
          mediaType:fichier.type,
          nom:fichier.name,
          size:fichier.size,
          dataUrl:dataUrl
        };
        TilexVision.imageEnAttente=_imageEnAttente;
        resolve(_imageEnAttente);
      };
      reader.onerror=function(){reject(new Error("Erreur lecture fichier"));};
      reader.readAsDataURL(fichier);
    });
  },

  loadFromInput:function(input){
    var file=input&&input.files&&input.files[0];
    if(!file)return Promise.reject(new Error("Aucun fichier"));
    return TilexVision.chargerImage(file);
  },

  loadFromPaste:function(clipboardData){
    return new Promise(function(resolve,reject){
      var items=clipboardData&&clipboardData.items;
      if(!items){reject(new Error("Pas de données"));return;}
      for(var i=0;i<items.length;i++){
        if(items[i].type.indexOf("image/")===0){
          var file=items[i].getAsFile();
          TilexVision.chargerImage(file).then(resolve).catch(reject);
          return;
        }
      }
      reject(new Error("Pas d'image dans le presse-papier"));
    });
  },

  loadFromDrop:function(dataTransfer){
    var file=dataTransfer&&dataTransfer.files&&dataTransfer.files[0];
    if(!file||file.type.indexOf("image/")!==0)return Promise.reject(new Error("Pas d'image"));
    return TilexVision.chargerImage(file);
  },

  afficherPreview:function(container,imgData){
    var img=imgData||_imageEnAttente;
    if(!img||!img.dataUrl)return null;

    var existante=document.getElementById("tilex-vision-preview");
    if(existante)existante.remove();

    var preview=document.createElement("div");
    preview.id="tilex-vision-preview";
    preview.className="tilex-vision-preview";

    var inner=document.createElement("div");
    inner.className="tilex-vision-preview-inner";

    var imgEl=document.createElement("img");
    imgEl.src=img.dataUrl;
    imgEl.alt=img.nom||"Image";

    var nom=document.createElement("span");
    nom.className="tilex-vision-nom";
    nom.textContent=img.nom||"image";

    var sizeKb=Math.round((img.size||0)/1024);
    var taille=document.createElement("span");
    taille.className="tilex-vision-taille";
    taille.textContent=sizeKb+" Ko";

    var annulerBtn=document.createElement("button");
    annulerBtn.className="tilex-vision-annuler";
    annulerBtn.textContent="✕";
    annulerBtn.title="Retirer l'image";
    annulerBtn.addEventListener("click",function(){
      TilexVision.annulerImage();
    });

    inner.appendChild(imgEl);
    inner.appendChild(nom);
    inner.appendChild(taille);
    inner.appendChild(annulerBtn);

    var badge=document.createElement("div");
    badge.className="tilex-vision-badge";
    badge.textContent="👁️ Vision Anthropic";

    preview.appendChild(inner);
    preview.appendChild(badge);
    container.insertBefore(preview,container.firstChild);
    return preview;
  },

  annulerImage:function(){
    _imageEnAttente=null;
    TilexVision.imageEnAttente=null;
    var preview=document.getElementById("tilex-vision-preview");
    if(preview)preview.remove();
  },

  buildVisionContent:function(texte){
    var img=_imageEnAttente;
    if(!img||!img.base64)return null;
    return [
      {type:"image",source:{type:"base64",media_type:img.mediaType,data:img.base64}},
      {type:"text",text:texte||"Analyse cette image et décris ce que tu vois."}
    ];
  },

  hasImage:function(){return !!_imageEnAttente;},
  getImage:function(){return _imageEnAttente;},
  clear:function(){
    _imageEnAttente=null;
    TilexVision.imageEnAttente=null;
    var preview=document.getElementById("tilex-vision-preview");
    if(preview)preview.remove();
  },

  showPreview:function(container,imgData){
    return TilexVision.afficherPreview(container,imgData);
  }
};

document.addEventListener("DOMContentLoaded",function(){
  var composerInput=document.getElementById("composer-input");
  if(composerInput){
    composerInput.addEventListener("paste",function(e){
      if(!e.clipboardData||!e.clipboardData.items)return;
      for(var i=0;i<e.clipboardData.items.length;i++){
        if(e.clipboardData.items[i].type.indexOf("image/")===0){
          e.preventDefault();
          TilexVision.loadFromPaste(e.clipboardData).then(function(img){
            var composer=document.querySelector(".composer-glass");
            if(composer)TilexVision.afficherPreview(composer,img);
            if(typeof showToastMsg==="function")showToastMsg("📋 Image collée");
          }).catch(function(){});
          return;
        }
      }
    });
  }

  var chatMsgs=document.getElementById("chat-msgs");
  if(chatMsgs){
    chatMsgs.addEventListener("dragover",function(e){e.preventDefault();e.currentTarget.classList.add("vision-dragover");});
    chatMsgs.addEventListener("dragleave",function(e){e.currentTarget.classList.remove("vision-dragover");});
    chatMsgs.addEventListener("drop",function(e){
      e.preventDefault();e.currentTarget.classList.remove("vision-dragover");
      if(!e.dataTransfer||!e.dataTransfer.files||!e.dataTransfer.files[0])return;
      if(e.dataTransfer.files[0].type.indexOf("image/")!==0)return;
      TilexVision.loadFromDrop(e.dataTransfer).then(function(img){
        var composer=document.querySelector(".composer-glass");
        if(composer)TilexVision.afficherPreview(composer,img);
        if(typeof showToastMsg==="function")showToastMsg("🖼️ Image déposée");
      }).catch(function(){});
    });
  }
});

console.log("[TilexVision] Chargé — Claude Vision via AI_PROXY (100% Anthropic)");
})();
