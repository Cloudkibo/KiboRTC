'use strict';

/**
 * This is core WebRTC one-to-one video call service. It depends on the Signalling Service for doing signalling.
 * Furthermore, it uses services from configuration too. To use this, one should follow the WebRTC call procedure.
 * Here it is mostly same as standard procedure of a WebRTC call, but this service hides much of the details from
 * application. Before starting a video call, initialize function must be called and it must be given reference of
 * HTML video elements. This service automatically attaches the remote and local streams to these video elements.
 * It also takes care of both local and remote screen sharing streams. Application must call the functions in
 * following order:
 *
 * 1. Call the initialize() function when controller loads
 * 2. Call the initilizeSignalling() function if not called initialize() function of signalling service
 * 3. Capture the audio & video using captureUserMedia()
 * 4. If both peers has captured the camera then initiator would call the createPeerConnection() function
 * (NOTE: It is responsibility of the application to make sure both peers have got the media access. Application
 * may use the Signalling Service for this purpose)
 * 5. Initiator subsequently would call the createAndSendOffer() method
 * 6. Other peer would receive the offer and would call createPeerConnection()
 * 7. Subsequently, other peer would set the received SDP using setRemoteDescription()
 * (NOTE: For now, it is the responsibility of application to listen to "message" on socket.io for offer, answer
 * and other WebRTC signalling messages)
 * 8. Other peer would now call createAndSendAnswer() function
 * 9. Subsequently, service would automatically get the ICECandidates and send them to other peer
 * (NOTE: Also for ICECandidates, application should listen to "message" and invoke the setRemoteDescription() if
 * the message type is candidate)
 * 10. To end the call, application must call the endConnection() function, however it is application's responsibility
 * to clean the User Interface or change it accordingly.
 */

angular.module('kiboRtc.services')
  .factory('WebRTC', function WebRTC($rootScope, pc_config, pc_constraints, sdpConstraints, video_constraints, audio_constraints, Signalling) {

    var isInitiator = false;
    /* It indicates which peer is the initiator of the call */
    var isStarted = false;
    /* It indicates whether the WebRTC session is started or not */

    var localVideoStream;
    /* It holds local camera stream */
    var localAudioStream;
    /* It holds local audio stream */
    var localStreamScreen;
    /* It holds local screen sharing stream */

    var videoShared = false;
    /* Booelean variable to check if local video is shared or not */
    var audioShared = false;
    /* Booelean variable to check if local audio is shared or not */

    var pc;
    /* Peer Connection object */

    var remoteVideoStream = null;
    /* It holds the other peer's camera stream */
    var remoteAudioStream = null;
    /* It holds the other peer's audio stream */
    var remoteStreamScreen = null;
    /* It holds the other peer's screen sharing stream */

    var localVideo;
    /* It is the HTML5 video element to hold local peer's video */
    var localVideoScreen;
    /* It is the HTML5 video element to hold local screen sharing video */

    var remoteVideo;
    /* It is the HTML5 video element to hold other peer's video */
    var remoteAudio;
    /* It is the HTML5 audio element to hold other peer's audio */
    var remoteVideoScreen;
    /* It is the HTML5 video element to hold other peer's screen sharing video */

    var screenShared = false;
    /* This boolean variable indicates if the other party has shared the screen */

    var sharingVideo = false;
    /* This boolean variable indicates if the other party is going to share video */

    var hidingVideo = false;
    /* This boolean variable indicates if the other party is going to hide video */

    var AUDIO = 'audio';
    /* Constant defining audio */
    var VIDEO = 'video';
    /* Constant defininf video */

    return {

      /**
       * Initialize the media elements. Application must call this function prior to making any WebRTC video
       * call. Application's UI must contain four video elements: two for local peer and two for remote peer.
       * Service would attach the local and incoming streams to these video elements by itself. You must get
       * the reference of these elements and pass them as parameters.
       *
       * @param localvideo Video Element to hold local peer's webcam video
       * @param localaudio Audio Element to hold local peer's audio
       * @param localvideoscreen Video Element to hold local peer's screen
       * @param remotevideo Video Element to hold remote peer's webcam video
       * @param remoteaudio Audio Element to hold remote peer's audio
       * @param remotevideoscreen Video Element to hold remote peer's screen
       */
      initialize: function (localvideo, localvideoscreen, remotevideo, remoteaudio, remotevideoscreen) {
        localVideo = localvideo;
        localVideoScreen = localvideoscreen;
        remoteVideo = remotevideo;
        remoteAudio = remoteaudio;
        remoteVideoScreen = remotevideoscreen;
      },

      /**
       * Creates Peer Connection and attaches the local stream to it. Application must call this function when
       * it knows that both the peers have got the local camera and mic access. In RTCPeerConnection(), we use
       * pc_config service from the configurations. Furthermore, service attaches some private callback functions
       * to some WebRTC connection events. Application doesn't need to care about them. This function assumes
       * that the local peer has got the camera and mic access and it adds the stream to peer connection object.
       *
       */
      createPeerConnection: function () {
        pc = new RTCPeerConnection(pc_config, {optional: []});//pc_constraints);
        pc.onicecandidate = handleIceCandidate;
        pc.onaddstream = handleRemoteStreamAdded;
        pc.onremovestream = handleRemoteStreamRemoved;
        pc.addStream(localAudioStream);
        if (localVideoStream)
          pc.addStream(localVideoStream);
      },

      /**
       * Create and Send Offer to other peer. When initiator has got the camera access and has subsequently
       * made the peer connection object using createPeerConnection(), it must call this function now to send
       * the offer to other party. This function uses two private functions as callback to set local description
       * and handle the create offer error. Application doesn't need to care about these functions.
       *
       */
      createAndSendOffer: function () {
        pc.createOffer(setLocalAndSendMessage, handleCreateOfferError);
      },

      /**
       * Create and Send Answer to the peer who made the offer. When peer receives offer from the initiator,
       * it must call this function after setting the remote description. It uses the sdbConstraints from the
       * configurations. It has the callback functions to set local description and handle create answer error.
       * Application is responsible for listening the "message" socket.io event and then check if type is offer.
       * Subsequently, application must call this function to send answer.
       *
       */
      createAndSendAnswer: function () {
        pc.createAnswer(setLocalAndSendMessage, function (error) {
          console.log(error)
        }, sdpConstraints);
      },

      /**
       * On receiving remote description from other peer with offer or answer message, application must call this
       * function to set the remote description to peer connection object.
       *
       * @param message It is the remote description sent to the local peer
       */
      setRemoteDescription: function (message) {
        pc.setRemoteDescription(new RTCSessionDescription(message));
      },

      /**
       * On receiving ice candidate from other peer, application must call this function to add this candidate
       * to local peer connection object. Application is responsible for listening the "message" socket.io event
       * and then check if type is candidate. Subsequently, appliction must call this function to set the remote
       * candidates.
       *
       * @param message It is the remote candidate sent to the local peer
       */
      addIceCandidate: function (message) {
        var candidate = new RTCIceCandidate({
          sdpMLineIndex: message.label,
          candidate: message.candidate
        });
        pc.addIceCandidate(candidate);
      },

      /**
       * This will toggle the local video on or off. It will automatically notify other client that
       * video has been turned off or on.
       *
       * @param cb callback function to notify application if task was not successful
       */
      toggleVideo: function (cb) {
        if (videoShared) {

          localVideoStream.stop();
          pc.removeStream(localVideoStream);
          Signalling.sendMessage('hiding video');
          pc.createOffer(setLocalAndSendMessage, handleCreateOfferError);

          localVideo.src = null;

          videoShared = false;

          $rootScope.$broadcast('localVideoRemoved');

          cb(null);
        }
        else {

          captureMedia(video_constraints, VIDEO, function (err) {
            if (err) return cb(err);

            pc.addStream(localVideoStream);
            Signalling.sendMessage('sharing video');
            pc.createOffer(setLocalAndSendMessage, handleCreateOfferError);

            localVideo.src = URL.createObjectURL(localVideoStream);

            videoShared = true;

            $rootScope.$broadcast('localVideoAdded');

            cb(null);

          });

        }
      },

      /**
       * This will toggle the local audio on or off. It will automatically notify other client that
       * audio has been turned off or on.
       *
       * @param cb callback function to notify application if task was not successful
       */
      toggleAudio: function (cb) {
        if (audioShared) {

          localAudioStream.stop();
          pc.removeStream(localAudioStream);
          pc.createOffer(setLocalAndSendMessage, handleCreateOfferError);

          audioShared = false;

          $rootScope.$broadcast('localAudioRemoved');

          cb(null);
        }
        else {

          captureMedia(audio_constraints, AUDIO, function (err) {
            if (err) return cb(err);

            pc.addStream(localAudioStream);
            pc.createOffer(setLocalAndSendMessage, handleCreateOfferError);

            audioShared = true;

            $rootScope.$broadcast('localAudioAdded');

            cb(null);

          });

        }
      },

      /**
       * Capture the User Media. Application must call this function to capture camera and mic. This function
       * uses video_constraints from the configurations. It sets the callback with null on success and err
       * on error. It attaches the local media stream to video element for the application.
       *
       * @param streamType Type of the stream to be captured. Possible values are "audio" or "video"
       * @param cb It is the callback which should be called with err if there was an error in accessing the media
       */
      captureUserMedia: function (streamType, cb) {
        var constraints;

        if (streamType == AUDIO)
          constraints = audio_constraints;
        else if (streamType == VIDEO)
          constraints = video_constraints;
        else
          return cb('Invalid stream type. Must be "audio" or "video"');

        captureMedia(constraints, streamType, cb);

      },

      /**
       * Gracefully Ends the WebRTC Peer Connection. When any peer wants to end the call, it must call this function.
       * It is the responsibility of application to inform other peer about ending of the call. Application would
       * clean or change the UI itself. Both the peers should call this function to end the call.
       * This function cleans many variables and also stop all the local streams so that camera and screen media
       * (if accessed) would be stopped. Finally, it closes the peer connection.
       *
       */
      endConnection: function () {
        isStarted = false;
        isInitiator = false;

        //console.log(localStream);

        if (localVideoStream) {
          localVideoStream.stop();
        }
        if (localAudioStream) {
          localAudioStream.stop();
        }
        if (localStreamScreen) {
          localStreamScreen.stop();
        }
        if (remoteVideoStream) {
          remoteVideoStream.stop();
          remoteVideo.src = null;
          remoteVideoStream = null;
        }
        if (remoteAudioStream) {
          remoteAudioStream.stop();
          remoteAudio.src = null;
          remoteAudioStream = null;
        }
        if (remoteStreamScreen) {
          remoteStreamScreen.stop();
          remoteVideoScreen.src = null;
          remoteStreamScreen = null;
        }

        //console.log(localStream);

        try {
          pc.close();
        } catch (e) {
        }

      },

      /**
       * Initializes the Signalling Service. Application can either initialize the signalling from this service or
       * by injecting the original Signalling Service and calling the initialize.
       *
       * Before starting any WebRTC call, application should give information about username of peers
       * and name of the room they join on the server.
       *
       * @param to Username of the other peer
       * @param from Username of this peer
       * @param roomName Name of the socket.io room which both peers must join for signalling
       */
      initializeSignalling: function (to, from, roomName) {
        Signalling.initialize(to, from, roomName);
      },

      /**
       * Application should call this function whenever the local peer wants to stop sharing the stream. This stops
       * the local screen stream and also removes the stream from the peer connection object. It is the responsibility
       * of application to call createAndSendOffer() function afterwards to let other peer know about this.
       */
      hideScreen: function () {
        localStreamScreen.stop();
        localVideoScreen.src = URL.createObjectURL(localVideoStream);
        pc.removeStream(localStreamScreen);
      },

      /**
       * Adds the screen stream to peer connection object and video element. There is a complete screen sharing
       * service in this library which talks to screen sharing extension and returns the stream.
       *
       * Currently, screen sharing service is used by application and application get the stream using screen
       * sharing service and add it to peer connection object by calling this function
       *
       * todo: Use the screen sharing service inside this service and don't depend  on application
       *
       * @param stream Screen sharing stream
       */
      addStreamForScreen: function (stream) {
        localStreamScreen = stream;
        localVideoScreen.src = URL.createObjectURL(stream);

        pc.addStream(stream);

      },

      /**
       *  Application can check if the local stream is fetched or not by calling this function.
       *
       * @returns {*}
       */
      getLocalAudioStream: function () {
        return localAudioStream;
      },

      /**
       * Application can set this to true for the peer who is the initiator of the call. Service must know
       * who is the initiator of the call. Initiator is the one who sends the offer to other peer.
       *
       * @param value Boolean variable to set the value for isInitiator
       */
      setInitiator: function (value) {
        isInitiator = value;
      },

      /**
       * Application can check if the peer is set as initiator or not by using this function. Initiator is
       * the one who sends the offer to other peer.
       * @returns {boolean}
       */
      getInitiator: function () {
        return isInitiator;
      },

      /**
       * Application can set this to true if the call or signalling has been started. This can be used to
       * put some controls i.e. do not send the candidates until the call is started
       *
       * @param value
       */
      setIsStarted: function (value) {
        isStarted = value;
      },

      /**
       * Application can check if the call or signalling has started or not. This can be used to put some controls.
       * i.e. do not send the candidates until the call is started
       *
       * @returns {boolean}
       */
      getIsStarted: function () {
        return isStarted;
      },

      /**
       * Client can check if the local video is being shared or not
       */
      isLocalVideoShared: function () {
        return videoShared;
      },

      /**
       * Client can check if the local audio is being shared or not
       */
      isLocalAudioShared: function () {
        return audioShared;
      },

      setSharingVideo: function (value) {
        sharingVideo = value;
      },

      setHidingVideo: function (value) {
        hidingVideo = value;
      }
    };

    /**
     * Handle Ice Candidate and send it to other peer. This callback is called from within the peer connection object
     * whenever there are candidates available. We need to send each candidate to remote peer. For this, we use
     * signalling service of this library. Refer to the Signalling Service for more information on signalling.
     *
     * This function is not exposed to application and is handled by library itself.
     *
     * @param event holds the candidate
     */
    function handleIceCandidate(event) {
      if (event.candidate) {
        Signalling.sendMessage({
          type: 'candidate',
          label: event.candidate.sdpMLineIndex,
          id: event.candidate.sdpMid,
          candidate: event.candidate.candidate
        });
      } else {
        //console.log('End of candidates.');
      }
    }

    /**
     * Set Local Description and send it to other peer. This callback function is called by createOffer()
     * function of the peer connection object. We need to set the Local Description in peer connection object
     * and then send it to the other peer too. Signalling service is used to send it to other peer. Refer to
     * Signalling service for more information on it.
     *
     * @param sessionDescription description about the session
     */
    function setLocalAndSendMessage(sessionDescription) {
      // Set Opus as the preferred codec in SDP if Opus is present.
      pc.setLocalDescription(sessionDescription);
      //console.log('setLocalAndSendMessage sending message' , sessionDescription);
      Signalling.sendMessage(sessionDescription);
    }

    /**
     * Handle the Create Offer Error. This callback function is called by createOffer() function of the
     * peer connection object whenever there is an error while creating the offer.
     *
     * @param error information about the error which occurred while creating offer
     */
    function handleCreateOfferError(error) {
      console.log('createOffer() error: ', error);
    }

    /**
     * Handle the remote stream. This call back function is used to handle the streams sent by the remote peer.
     * Currently, we have two types of streams to hold: video streams, audio stream and screen sharing stream. This
     * function takes care of handling of all stream and assigning them to correct video or audio element.
     *
     * When screen is shared it broadcasts 'screenShared' to the application. Application is responsible
     * to listen to that message and change the UI accordingly i.e. show video element
     *
     * @param event holds the stream sent by the remote peer
     */
    function handleRemoteStreamAdded(event) {
      if (event.stream.getAudioTracks().length) {
        remoteAudio.src = URL.createObjectURL(event.stream);
        remoteAudioStream = event.stream;
      }

      if (event.stream.getVideoTracks().length) {
        if (!remoteVideoStream || sharingVideo) {
          remoteVideo.src = URL.createObjectURL(event.stream);
          remoteVideoStream = event.stream;
          sharingVideo = false;
        } else {
          remoteVideoScreen.src = URL.createObjectURL(event.stream);
          remoteStreamScreen = event.stream;
          $rootScope.$broadcast('screenShared');
        }
      }
    }

    /**
     * Handle the remote peer stream removal. This callback function is used to handle the situation when remote
     * peer removes any stream i.e. stops screen sharing. This function takes care of knowing which stream has
     * been removed.
     *
     * When screen is removed it broadcasts 'screenShared' to the application. Application is responsible
     * to listen to that message and change the UI accordingly i.e. hide video element
     *
     * @param event
     */
    function handleRemoteStreamRemoved(event) {
      //console.log(event);
      if(hidingVideo){
        remoteVideoStream.stop();
        remoteVideoStream = null;
        hidingVideo = false;
      }

      if (typeof remoteStreamScreen != 'undefined' && !hidingVideo) {
        remoteStreamScreen.stop();
        remoteStreamScreen = null;
        $rootScope.$broadcast('screenRemoved');
      }
      else {
        remoteStreamScreen.stop();
        remoteVideoStream.stop();

        remoteStreamScreen = null;
        remoteVideoStream = null;
      }
    }

    /**
     * Helper function to capture user media. This will be used by the service internally. This
     * should not be exposed to the application.
     *
     * @param constraints Audio or Video constraints should be set here
     * @param type Stream type should be specified here. Possible values are 'audio' and 'video'
     * @param cb Callback function should be given here
     */
    function captureMedia(constraints, type, cb) {

      getUserMedia(constraints,
        function (newStream) {

          if (type == AUDIO) {
            localAudioStream = newStream;
            audioShared = true;
          }
          else if (type == VIDEO) {
            localVideoStream = newStream;
            localVideo.src = URL.createObjectURL(newStream);
            videoShared = true;
          }

          cb(null);
        },
        function (err) {
          cb(err);
        }
      );

    }


  });
