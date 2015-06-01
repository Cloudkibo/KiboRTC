'use strict';

/**
 * This is collection of configuration services used in WebRTC Connection. All the services use
 * them to create peer connection. Application can change some of the configurations like changing
 * ICE Server URLs by injecting the concerned service
 */

angular.module('kiboRtc.services')

/**
 * This returns the array of ICE Servers used by WebRTC when peers are behind the proxies and
 * direct connection is impossible.
 *
 * todo: Add the function addICEServer which should take JSON array or JSON object as input
 */
  .factory('pc_config', function () {

    var isChrome = !!navigator.webkitGetUserMedia;

    return {'iceServers': [
      createIceServer(isChrome
        ? 'stun:stun.l.google.com:19302'
        : 'stun:23.21.150.121', null, null)
    ]};

    /*
     return {'iceServers': [createIceServer('turn:cloudkibo@162.243.217.34:3478?transport=udp', 'cloudkibo', 'cloudkibo'),
       createIceServer('stun:stun.l.google.com:19302', null, null),
     createIceServer('stun:stun.anyfirewall.com:3478', null, null),
     createIceServer('turn:turn.bistri.com:80?transport=udp', 'homeo', 'homeo'),
     createIceServer('turn:turn.bistri.com:80?transport=tcp', 'homeo', 'homeo'),
     createIceServer('turn:turn.anyfirewall.com:443?transport=tcp', 'webrtc', 'webrtc')
     ]};*/
     /*

    return {
      'iceServers': [{
        url: 'turn:cloudkibo@162.243.217.34:3478?transport=udp', username: 'cloudkibo',
        credential: 'cloudkibo'
      },
        {url: 'stun:stun.l.google.com:19302', username: null, credential: null},
        {url: 'stun:stun.anyfirewall.com:3478', username: null, credential: null},
        {url: 'turn:turn.bistri.com:80?transport=udp', username: 'homeo', credential: 'homeo'},
        {url: 'turn:turn.bistri.com:80?transport=tcp', username: 'homeo', credential: 'homeo'},
        {url: 'turn:turn.anyfirewall.com:443?transport=tcp', username: 'webrtc', credential: 'webrtc'}
      ]
    };
    */
    /*
     {url: 'turn:cloudkibo@162.243.217.34:3478?transport=udp', username: 'cloudkibo',
     credential: 'cloudkibo'}
     */
  })

/**
 * Configurations for Reliable Data Channel Connection
 *
 * NOTE: Applications should not use them directly
 *
 * todo: write more documentation from WebRTC official documentation for this
 */
  .factory('pc_constraints', function () {
    return {'optional': [{'DtlsSrtpKeyAgreement': true}, {'RtpDataChannels': true}]};
  })

/**
 * Session Description Protocol Constraints
 *
 * NOTE: Applications should not use them directly
 */
  .factory('sdpConstraints', function () {
    return {
      'mandatory': {
        'OfferToReceiveAudio': true,
        'OfferToReceiveVideo': true
      }
    };
  })

/**
 * Video Constraints for getUserMedia() of WebRTC API
 *
 * todo: add the function setVideoConstraints
 */

  .factory('video_constraints', function () {
    return {video: true, audio: false};
  })

/**
 * Audio Constraints for getUserMedia() of WebRTC API
 *
 * todo: add the function setVideoConstraints
 */

  .factory('audio_constraints', function () {
    return {video: false, audio: true};
  });
