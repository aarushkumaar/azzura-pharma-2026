/* ============================================================
   AZZURRA PHARMACONUTRITION — CLOUDINARY UTILITIES
   Provides shared functions to safely modify Cloudinary URLs
   without duplicating transformations or creating invalid URLs.
   ============================================================ */

(function (global) {
  'use strict';

  var UPLOAD_PATH = '/image/upload/';

  /**
   * Safely adds or updates transformations on a Cloudinary URL.
   * Handles existing transformations and ensures no duplicates.
   * e.g. cldUrl(".../image/upload/a_90/v123/img.png", "f_auto,q_auto,w_150")
   * => ".../image/upload/a_90,f_auto,q_auto,w_150/v123/img.png"
   */
  function cldUrl(url, transform) {
    if (!url || typeof url !== 'string' || url.indexOf('res.cloudinary.com') === -1) {
      return url;
    }
    
    var parts = url.split(UPLOAD_PATH);
    if (parts.length < 2) return url;
    
    var base = parts[0] + UPLOAD_PATH;
    var path = parts.slice(1).join(UPLOAD_PATH);
    
    var pathSegments = path.split('/');
    var versionIndex = -1;
    
    for (var i = 0; i < pathSegments.length; i++) {
      if (/^v\d+$/.test(pathSegments[i])) {
        versionIndex = i;
        break;
      }
    }
    
    var transforms = [];
    var restOfPath = [];
    
    if (versionIndex > 0) {
      transforms = pathSegments.slice(0, versionIndex).join(',').split(',');
      restOfPath = pathSegments.slice(versionIndex);
    } else if (versionIndex === 0) {
      restOfPath = pathSegments;
    } else {
      if (pathSegments[0].indexOf('.') === -1 && pathSegments[0].indexOf('_') !== -1) {
        transforms = pathSegments[0].split(',');
        restOfPath = pathSegments.slice(1);
      } else {
        restOfPath = pathSegments;
      }
    }
    
    var newTransforms = String(transform).split(',');
    var mergedTransforms = [];
    var prefixesToReplace = newTransforms.map(function(t) { return t.split('_')[0] + '_'; });
    
    for (var i = 0; i < transforms.length; i++) {
      var t = transforms[i];
      if (!t) continue;
      var prefix = t.split('_')[0] + '_';
      if (prefixesToReplace.indexOf(prefix) === -1) {
        mergedTransforms.push(t);
      }
    }
    
    for (var i = 0; i < newTransforms.length; i++) {
      if (newTransforms[i]) mergedTransforms.push(newTransforms[i]);
    }
    
    var finalTransformsStr = mergedTransforms.join(',');
    
    return base + (finalTransformsStr ? finalTransformsStr + '/' : '') + restOfPath.join('/');
  }

  /**
   * Applies a permanent rotation transformation to the Cloudinary URL.
   * addDeg can be 90, 180, 270, -90, etc.
   * Rotations are cumulative.
   */
  function cldRotateUrl(url, addDeg) {
    if (!url || typeof url !== 'string' || url.indexOf('res.cloudinary.com') === -1 || !addDeg) {
      return url;
    }
    
    var parts = url.split(UPLOAD_PATH);
    if (parts.length < 2) return url;
    
    var base = parts[0] + UPLOAD_PATH;
    var path = parts.slice(1).join(UPLOAD_PATH);
    
    var pathSegments = path.split('/');
    var versionIndex = -1;
    for (var i = 0; i < pathSegments.length; i++) {
      if (/^v\d+$/.test(pathSegments[i])) {
        versionIndex = i;
        break;
      }
    }
    
    var transforms = [];
    var restOfPath = [];
    if (versionIndex > 0) {
      transforms = pathSegments.slice(0, versionIndex).join(',').split(',');
      restOfPath = pathSegments.slice(versionIndex);
    } else if (versionIndex === 0) {
      restOfPath = pathSegments;
    } else {
      if (pathSegments[0].indexOf('.') === -1 && pathSegments[0].indexOf('_') !== -1) {
        transforms = pathSegments[0].split(',');
        restOfPath = pathSegments.slice(1);
      } else {
        restOfPath = pathSegments;
      }
    }
    
    var currentDeg = 0;
    var finalTransforms = [];
    for (var i = 0; i < transforms.length; i++) {
      var t = transforms[i];
      if (!t) continue;
      if (t.startsWith('a_')) {
        var val = parseInt(t.substring(2), 10);
        if (!isNaN(val)) currentDeg = (currentDeg + val) % 360;
      } else {
        finalTransforms.push(t);
      }
    }
    
    var newDeg = (currentDeg + addDeg) % 360;
    if (newDeg < 0) newDeg += 360;
    
    if (newDeg !== 0) {
      finalTransforms.push('a_' + newDeg);
    }
    
    var finalTransformsStr = finalTransforms.join(',');
    
    return base + (finalTransformsStr ? finalTransformsStr + '/' : '') + restOfPath.join('/');
  }

  /**
   * Converts an image File to a WebP Blob using canvas.
   * Preserves transparency and orientation where supported.
   */
  function toWebP(file) {
    return new Promise(function(resolve) {
      if (!file || !file.type || !file.type.startsWith('image/')) return resolve(file);
      if (file.type === 'image/webp') return resolve(file);

      var url = URL.createObjectURL(file);
      if (typeof createImageBitmap === 'function') {
        createImageBitmap(file, { imageOrientation: 'from-image' }).then(function(bmp) {
          var canvas = document.createElement('canvas');
          canvas.width  = bmp.width;
          canvas.height = bmp.height;
          var ctx = canvas.getContext('2d');
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(bmp, 0, 0);
          bmp.close();
          canvas.toBlob(function(blob) {
            resolve(blob || file);
          }, 'image/webp', 0.88);
        }).catch(function() {
          resolve(file);
        });
      } else {
        var img = new Image();
        img.onload = function() {
          var canvas = document.createElement('canvas');
          canvas.width  = img.width;
          canvas.height = img.height;
          var ctx = canvas.getContext('2d');
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);
          URL.revokeObjectURL(url);
          canvas.toBlob(function(blob) {
            resolve(blob || file);
          }, 'image/webp', 0.88);
        };
        img.onerror = function() { URL.revokeObjectURL(url); resolve(file); };
        img.src = url;
      }
    });
  }

  /**
   * Upload to Cloudinary using unsigned preset 'azzura'.
   * Handles products, events, and banners cleanly.
   */
  async function uploadToCloudinary(blob, folder, baseName) {
    var CLOUD_NAME = 'dfiskvjbl';
    var PRESET     = 'azzura';
    var fd = new FormData();
    fd.append('file', blob);
    fd.append('upload_preset', PRESET);

    if (folder) {
      var targetFolder = folder;
      if (!targetFolder.startsWith('azzura_')) {
        if (targetFolder === 'events' || targetFolder === 'banners') {
          targetFolder = 'azzura_' + targetFolder;
        } else {
          targetFolder = 'azzura_products/' + targetFolder;
        }
      }
      fd.append('folder', targetFolder);
    }

    var res = await fetch('https://api.cloudinary.com/v1_1/' + CLOUD_NAME + '/image/upload', {
      method: 'POST',
      body: fd
    });
    var data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(data.error ? data.error.message : 'Cloudinary upload failed (HTTP ' + res.status + ')');
    }
    return data.secure_url || ('https://res.cloudinary.com/' + CLOUD_NAME + '/image/upload/' + data.public_id);
  }

  // Export
  global.cldUrl = cldUrl;
  global.cldRotateUrl = cldRotateUrl;
  global.toWebP = toWebP;
  global.uploadToCloudinary = uploadToCloudinary;

})(typeof window !== 'undefined' ? window : this);

