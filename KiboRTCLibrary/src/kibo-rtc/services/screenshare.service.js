'use strict';

/**
 * This service is used to communicate with screen sharing extension on behalf of application. Application
 * must use the extension code provided by our library to use when creating its own extension. It will
 * check if the extension is installed or not. It will also ask for the sourceId from the extension to know
 * which window user wants to share. It can also tell the application if the user denied the access to screen.
 *
 * todo: this service should also contain the code to install the extension in-line
 * todo: this service should not be used by application directly, other webrtc service must depend on it
 *
 * NOTE: Following code was taken from the example of Muaz Khan, it has been converted from plain javascript to
 * angularjs code
 */
angular.module('kiboRtc.services')
    .factory('ScreenShare', function ScreenShare($rootScope, $window, pc_config, pc_constraints, sdpConstraints, video_constraints, Signalling) {

        // todo need to check exact chrome browser because opera also uses chromium framework
        var isChrome;

        var screenCallback;             /* Hold the callback function for a while as extension reply may take some time */

        var chromeMediaSource;          /* chromeMediaSource holds what screen user wants to share */

        /**
         * this statement defines getUserMedia constraints that will be used to capture content of screen
         *
         * @type {{mandatory: {chromeMediaSource: *, maxWidth: number, maxHeight: number, minAspectRatio: number}, optional: Array}}
         */
        var screen_constraints = {
            mandatory: {
                chromeMediaSource: chromeMediaSource,
                maxWidth: 1920,
                maxHeight: 1080,
                minAspectRatio: 1.77
            },
            optional: []
        };

        /**
         * it is the session that we want to be captured audio must be false
         *
         * @type {{audio: boolean, video: {mandatory: {chromeMediaSource: *, maxWidth: number, maxHeight: number, minAspectRatio: number}, optional: Array}}}
         */
        var session = {
            audio: false,
            video: screen_constraints
        };

        var sourceId;                   /* Screen object that user wants to share */

        return {

            /**
             * Application must initialize the service before using it for screen sharing.
             *
             * This function also listens to the messages sent to us by ScreenSharing Extension. It should be called by
             * the application at beginning with initialize() function.
             */
            initialize: function () {
                // todo need to check exact chrome browser because opera also uses chromium framework
                isChrome = !!navigator.webkitGetUserMedia;

                chromeMediaSource = 'screen';

                // listening to messages sent to us be Screen Sharing Extension.
                window.addEventListener('message', function (event) {
                    if (event.origin != window.location.origin) {
                        return;
                    }

                    onMessageCallback(event.data);
                });
            },

            /**
             * This function communicates with extension to get the screen source id. When user wants to share screen
             * he/she is asked if he/she wants to share full screen or just one of the open windows. Source Id is
             * to recognize which window user has chosen to share
             *
             * @param callback returns the source-id or PermissionDeniedError
             */
            getSourceId: function (callback) {
                if (!callback) throw '"callback" parameter is mandatory.';
                screenCallback = callback;
                $window.postMessage('get-sourceId', '*');
            },

            /**
             * This function tries to communicate with the extension to know its availability. It sends the message
             * "are-you-there" to extension and waits for 2 seconds and if there is no reply it assumes that extension
             * is not installed. Application is responsible for showing the option to install the extension if this
             * function returns false
             *
             * @param callback
             */
            isChromeExtensionAvailable: function (callback) {
                if (!callback) return;

                if (chromeMediaSource == 'desktop') callback(true);

                // ask extension if it is available
                $window.postMessage('are-you-there', '*');

                setTimeout(function () {
                    if (chromeMediaSource == 'screen') {
                        callback(false);
                    } else {
                        callback(true);
                        screen_constraints.mandatory.chromeMediaSource = 'desktop';
                    }
                }, 2000);

            },

            /**
             * Returns the object of screen_constraints
             *
             * @returns {{mandatory?: {chromeMediaSource: *, maxWidth: number, maxHeight: number, minAspectRatio: number}, : Array}}
             */
            screen_constraints: function () {
                return screen_constraints;
            },

            /**
             * Returns the the object of session. Audio should be false for screen sharing
             *
             * @returns {{audio: boolean, video: {mandatory?: {chromeMediaSource: *, maxWidth: number, maxHeight: number, minAspectRatio: number}, : Array}}}
             */
            session: function () {
                return session;
            },

            /**
             * If the returns "screen" it means extension is not installed, if it returns "Desktop" it means it is
             * installed
             *
             * @returns {*}
             */
            getChromeMediaSource: function () {
                return chromeMediaSource;
            },

            /**
             * Returns the source id of the screen object which is to be shared
             *
             * @returns {*}
             */
            getSourceIdValue: function () {
                return sourceId;
            },

            /**
             * It sets the source id in screen_constraints which is used by geUserMedia() Element
             */
            setSourceIdInConstraints: function () {
                screen_constraints.mandatory.chromeMediaSourceId = sourceId;
                session.video = screen_constraints;
            }

        };

        /**
         * It handles the messages sent from the screen sharing extension. Extension
         * can send 3 types of messages: PermissionDeniedError (user denies to share screen),
         * kiboconnection-extension-loaded (extension informs its availability) and sourceId
         * (the screen object user has selected to share)
         *
         * @param data message sent by screen share extension
         * @returns {*}
         */
        function onMessageCallback (data) {
            //console.log('chrome message', data);

            // "cancel" button is clicked
            if (data == 'PermissionDeniedError') {
                chromeMediaSource = 'PermissionDeniedError';
                if (screenCallback) return screenCallback('PermissionDeniedError');
                else throw new Error('PermissionDeniedError');
            }

            // extension notified its presence
            if (data == 'kiboconnection-extension-loaded') {
                chromeMediaSource = 'desktop';
            }

            // extension shared temp sourceId
            if (data.sourceId) {
                sourceId = data.sourceId;
                if (screenCallback) screenCallback(data.sourceId);
            }
        }


    });
