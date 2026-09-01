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

  // Export
  global.cldUrl = cldUrl;
  global.cldRotateUrl = cldRotateUrl;

})(typeof window !== 'undefined' ? window : this);
