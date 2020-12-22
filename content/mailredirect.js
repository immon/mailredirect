// authors: Pawel Krzesniak, Ronald Wahl, Onno Ekker

"use strict";

(function() {

const Cc = Components.classes, Ci = Components.interfaces;

const { Log } = ChromeUtils.import("resource://gre/modules/Log.jsm");

var { MailUtils } = ChromeUtils.import("resource:///modules/MailUtils.jsm");

window.MailredirectExtension = {

  isOffline: Cc["@mozilla.org/network/io-service;1"].
             getService(Ci.nsIIOService).
             offline,

  addToForwardAs: true,
  hideRedirectMenuitems: false,

  OpenMailredirectComposeWindow: function()
  {
    var selectedURIs;
    var server;
    var folder;
    if (typeof gFolderDisplay !== "undefined") {
      selectedURIs = gFolderDisplay.selectedMessageUris;
      folder = gFolderDisplay.displayedFolder;
    } else {
      var mailWindow = Cc["@mozilla.org/appshell/window-mediator;1"].
                       getService(Ci.nsIWindowMediator).getMostRecentWindow("");
      selectedURIs = mailWindow.GetSelectedMessages();
      folder = GetLoadedMsgFolder();
    }
    if (folder) {
      server = folder.server;
    }

    var currentIdentity = {key: null};
    if (server && (server.type === "imap" || server.type === "pop3")) {
      if (typeof MailUtils.getIdentityForServer === "function") {
        currentIdentity = MailUtils.getIdentityForServer(server);
      } else {
        currentIdentity = getIdentityForServer(server);
      }
    }

    window.openDialog("chrome://mailredirect/content/mailredirect-compose-thunderbird.xhtml", "_blank",
        "chrome,extrachrome,menubar,resizable,scrollbars,status,toolbar,center,dialog=no",
        selectedURIs, currentIdentity.key);
  },

  MailredirectController: {
    supportsCommand: function(aCommand)
    {
      switch(aCommand) {
        case "cmd_mailredirect":
          return true;
        default:
          return false;
      }
    },
    isCommandEnabled: function(aCommand)
    {
      switch(aCommand) {
        case "cmd_mailredirect":
          if (!MailredirectExtension.isOffline) {
            // Extra check for issue #9 (Init error in TB24 on Mac breaking the status bar)
            if (gFolderDisplay) {
              var windowMediator = Cc["@mozilla.org/appshell/window-mediator;1"].
                                   getService(Ci.nsIWindowMediator);
              var currWindow = windowMediator.getMostRecentWindow(null);
              var currWindowType = currWindow.document.documentElement.getAttribute("windowtype");
              if (currWindowType === "mail:messageWindow") {
                return true;
              } else if (currWindowType === "mail:3pane") {
                return (GetNumSelectedMessages() > 0 && !gFolderDisplay.selectedMessageIsFeed);
              }
            } else {
              Components.utils.reportError("MailredirectController cannot determine isCommandEnabled state for cmd_mailredirect, because gFolderDisplay is not yet initialized");
            }
          }
          return false;
        default:
          return false;
      }
    },
    doCommand: function(aCommand)
    {
      // if the user invoked a key short cut then it is possible that we got here for a command which is
      // really disabled. kick out if the command should be disabled.
      if (!this.isCommandEnabled(aCommand)) {
        return;
      }

      switch(aCommand) {
        case "cmd_mailredirect":
          MailredirectExtension.OpenMailredirectComposeWindow();
          break;
      }
    }
  },

  SetupController: function(event)
  {
    setTimeout(function() {
      top.controllers.appendController(MailredirectExtension.MailredirectController);
      goUpdateCommand("cmd_mailredirect");
      MailredirectExtension.UpdateCommand();
    }, 100);
  },

  OfflineObserver: {
    observe: function(subject, topic, state)
    {
      // Sanity check
      if (topic !== "network:offline-status-changed") {
        return;
      }
      MailredirectExtension.isOffline = (state === "offline");
      goUpdateCommand("cmd_mailredirect");
    }
  },

  UpdateCommand: function(event)
  {
    goUpdateCommand("cmd_mailredirect");
  },

  FillMailContextMenu: function(event)
  {
    MailredirectExtension.UpdateCommand(event);

    var item = document.getElementById("mailContext-mailredirect");
    if (item !== null) {
      // don't show mail items for links/images
      // and don't show mail items when there are no messages selected
      item.hidden = gContextMenu.onImage || gContextMenu.onLink || (gFolderDisplay.selectedCount === 0);
    }

    var multiForward = document.getElementById("mailContext-multiForwardAsAttachment");
    if (multiForward !== null) { // SeaMonkey doesn't have multiForward
      var multiRedirect = document.getElementById("mailContext-multiMailredirect");
      multiRedirect.hidden = multiForward.hidden;
      if (multiRedirect.hidden !== true && item !== null) {
        // Only show one Redirect menuitem
        item.hidden = true;
      }
    }
  },

  MultimessageClick: function(event)
  {
    if (event.button === 0) {
      goDoCommand("cmd_mailredirect")
    }
  },

  AddRedirectButtonToElement: function(el)
  {
    if (el.contentDocument.getElementById("multimessageHdrMailredirectButton") === null) {
      var hdrMailredirectButton = document.getElementById("hdrMailredirectButton");
      if (hdrMailredirectButton === null) {
        // The CompactHeader extension can hide the hdrMailredirectButton and add a copy of
        // the mailredirect-toolbarbutton button from the Mail toolbar to the msgHeaderViewDeck
        hdrMailredirectButton = document.getElementById("msgHeaderViewDeck").getElementsByClassName("customize-header-toolbar-mailredirect-toolbarbutton").item(0);
      }
      if (hdrMailredirectButton === null) {
        // Try the mail toolbar header button when the message header redirect button is not found
        hdrMailredirectButton = document.getElementById("mailredirect-toolbarbutton");
      }
      if (hdrMailredirectButton !== null) {
        // Only create a redirect button for multimessage view if one is found on message header or toolbar
        var head = el.contentDocument.getElementsByTagName("head").item(0);
        var newEl = document.createXULElement("link");
        newEl.setAttribute("rel", "stylesheet");
        newEl.setAttribute("media", "screen");
        newEl.setAttribute("type", "text/css");
        newEl.setAttribute("href", "resource://mailredirect-os/mailredirect.css");
        head.appendChild(newEl);

        var disabled = hdrMailredirectButton.getAttribute("disabled");
        var label = hdrMailredirectButton.getAttribute("label");
        var image = window.getComputedStyle(hdrMailredirectButton, null).getPropertyValue("list-style-image");
        var region = window.getComputedStyle(hdrMailredirectButton, null).getPropertyValue("-moz-image-region");
        if (disabled && region !== "auto") {
          // Calculate the right region...
          // Disabled: -moz-image-region: rect(32px, 16px, 48px, 0px);
          // Normal: -moz-image-region: rect(16px, 16px, 32px, 0px);
          // Normal is always the rect above Disabled
          let coords = region.replace("rect(", "").replace("px)", "").replace("px", "", "g").split(", ");
          if (coords[0] !== "0") {
            coords[0] = coords[0].toString() - coords[1].toString();
            coords[2] = coords[2].toString() - coords[1].toString();
            region = "rect(" + coords[0] + "px, " + coords[1] + "px, " + coords[2] + "px, " + coords[3] + "px)";
          }
        }
        var body = el.contentDocument.getElementsByTagName("body").item(0);
        var oldEl = body && el.contentDocument.getElementsByTagName("toolbarbutton").item(0); // hdrArchiveButton
        if (oldEl !== null) {
          // Thunderbird 10+ has toolbarbuttons
          var newEl = document.createXULElement("toolbarbutton");
          newEl.setAttribute("id", "multimessageHdrMailredirectButton");
          newEl.setAttribute("class", "toolbarbutton-1 msgHeaderView-button hdrMailredirectButton");
          if (hdrMailredirectButton !== null) {
            newEl.setAttribute("style", "list-style-image: " + image + "; -moz-image-region: " + region + ";");
            newEl.setAttribute("label", label);
          }
          newEl.addEventListener("click", MailredirectExtension.MultimessageClick, false);
          var insEl = oldEl.parentNode.insertBefore(newEl, oldEl);
        }
      }
    }
  },

  PrefObserver: {
    observe: function(subject, topic, data)
    {
      // Sanity check
      if (topic !== "nsPref:changed") {
        return;
      }

      switch(data) {
        case "addToForwardAs":
          MailredirectExtension.addToForwardAs = MailredirectPrefs.getPref("extensions.mailredirect.addToForwardAs");
          MailredirectExtension.UpdateForwardAsMenus();
          break;
        case "hideRedirectMenuitems":
          MailredirectExtension.hideRedirectMenuitems = MailredirectPrefs.getPref("extensions.mailredirect.hideRedirectMenuitems");
          MailredirectExtension.UpdateRedirectMenuitems();
          break;
      }
    }
  },

  UpdateForwardAsMenus: function()
  {
    let addToForwardAs = MailredirectExtension.addToForwardAs;
    let elementArray = [ "menu_forwardAsRedirect",
                         "button-ForwardAsRedirect",
                         "mailContext-forwardAsMailredirect",
                         "hdrForwardAsRedirectMenu",
                         "appmenu_forwardAsMailredirect" ];

    for (var i = 0; i < elementArray.length; i++) {
      var el = document.getElementById(elementArray[i]);
      if (el) {
        el.collapsed = !addToForwardAs;
      }
    }

    MailredirectExtension.UpdateRedirectMenuitems();
  },

  UpdateRedirectMenuitems: function()
  {
    let hideRedirectMenuitems = MailredirectExtension.addToForwardAs &&
                                MailredirectExtension.hideRedirectMenuitems;
    let elementArray = [ "MailredirectMenuItem",
                         "mailContext-mailredirect",
                         "appmenu_mailredirect" ]

    for (var i = 0; i < elementArray.length; i++) {
      var el = document.getElementById(elementArray[i]);
      if (el) {
        el.collapsed = hideRedirectMenuitems;
      }
    }

    let submenuitem = document.getElementById("menu_forwardAsRedirect");
    let menuitem = document.getElementById("MailredirectMenuItem");
    if (hideRedirectMenuitems) {
      submenuitem.setAttribute("key", "key_mailredirect");
      if (menuitem.hasAttribute("key")) {
        menuitem.removeAttribute("key");
      }
    } else {
      if (submenuitem.hasAttribute("key")) {
        submenuitem.removeAttribute("key");
      }
      menuitem.setAttribute("key", "key_mailredirect");
    }
  },

  InstallListeners: function(event)
  {
    var el = document.getElementById("threadTree");
    if (el !== null) {
      el.addEventListener("select", MailredirectExtension.UpdateCommand, false);
    }

    el = document.getElementById("mailContext");
    if (el !== null) {
      el.addEventListener("popupshowing", MailredirectExtension.FillMailContextMenu, false);
    }

    // I've got to perform some tricks for multimessage redirect button, because it is in an iframe
    el = document.getElementById("multimessage");
    if (el !== null) {
      // MailredirectExtension.AddRedirectButtonToElement(el);
    }

    // Move Redirect toolbarbutton to the right place in appmenu for TB 68+
    // (Can't do that directly from xul, because vbox is anonymous)
    var panelview = document.getElementById("appMenu-messageView");
    if (panelview !== null) {
      let item = document.getElementById("appmenu_mailredirect");
      let insertAfter = document.getElementById("appmenu_forwardAsMenu");
      if (item !== insertAfter.nextSibling) {
        insertAfter.parentNode.insertBefore(item, insertAfter.nextSibling);
      }

      item = document.getElementById("appmenu_forwardAsMailredirect");
      insertAfter = document.getElementById("appmenu_forwardAsAttachment");
      if (item !== insertAfter.nextSibling) {
        insertAfter.parentNode.insertBefore(item, insertAfter.nextSibling);
      }
    }
  },

  addButtonToMultimessageView: function(event)
  {
    if (event.target.id === "multimessage") {
      MailredirectExtension.AddRedirectButtonToElement(event.target);
    }
  },

  UninstallListeners: function(event)
  {
    var el = document.getElementById("threadTree");
    if (el !== null) {
      el.removeEventListener("select", MailredirectExtension.UpdateCommand, false);
    }

    el = document.getElementById("mailContext");
    if (el !== null) {
      el.removeEventListener("popupshowing", MailredirectExtension.FillMailContextMenu, false);
    }

    el = document.getElementById("multimessage");
    if (el !== null) {
      el = el.contentDocument.getElementById("hdrMailredirectButton");
      if (el !== null) {
        el.removeEventListener("click", MailredirectExtension.MultimessageClick, false);
      }
    }
  },

  AddObservers: function()
  {
    var observerService = Cc["@mozilla.org/observer-service;1"].
                          getService(Ci.nsIObserverService);
    observerService.addObserver(MailredirectExtension.OfflineObserver, "network:offline-status-changed", false);

    var prefService = Cc["@mozilla.org/preferences-service;1"].
                      getService(Ci.nsIPrefService);
    window.prefBranch = prefService.getBranch("extensions.mailredirect.");
    window.prefBranch.addObserver("", MailredirectExtension.PrefObserver, false);

    MailredirectExtension.addToForwardAs = MailredirectPrefs.getPref("extensions.mailredirect.addToForwardAs");
    MailredirectExtension.hideRedirectMenuitems = MailredirectPrefs.getPref("extensions.mailredirect.hideRedirectMenuitems");
    MailredirectExtension.UpdateForwardAsMenus();
  },

  RemoveObservers: function()
  {
    var observerService = Cc["@mozilla.org/observer-service;1"].
                          getService(Ci.nsIObserverService);
    observerService.removeObserver(MailredirectExtension.OfflineObserver, "network:offline-status-changed");
    window.prefBranch.removeObserver("", MailredirectExtension.PrefObserver);
  }
}

/*
window.MailredirectPrefs.init();

window.addEventListener("load", MailredirectExtension.InstallListeners, false);
window.addEventListener("load", MailredirectExtension.AddObservers, false);
window.addEventListener("load", MailredirectExtension.SetupController, false);
window.addEventListener("DOMFrameContentLoaded", MailredirectExtension.addButtonToMultimessageView, true);

// Starting in Thunderbird 60 add-ons aren't unpacked anymore
window.MailredirectPrefs.unpackIcon();

window.addEventListener("unload", MailredirectExtension.UninstallListeners, false);
window.addEventListener("unload", MailredirectExtension.RemoveObservers, false);
*/

})();
