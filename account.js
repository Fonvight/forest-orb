let sessionId = null;

const badgeSlotsPerRow = 5;
const maxBadgeSlotRows = 4;
let badgeSlotRows = 1;

let badgeCache;
let badgeSlotCache;

let localizedBadges;
let localizedBadgesIgnoreUpdateTimer = null;

const overlayBadgeIds = [ 'mono', 'ticket' ]; // Doing this until we have a better approach since we don't necessarily have the badge cache loaded

function initAccountControls() {
  document.getElementById('loginButton').onclick = () => {
    document.getElementById('loginErrorRow').classList.add('hidden');
    openModal('loginModal');
  };
  document.getElementById('logoutButton').onclick = () => {
    apiFetch('logout')
      .then(response => {
        if (!response.ok)
          console.log(response.statusText);
      }).catch(err => console.error(err));
    setCookie('sessionId', '');
    fetchAndUpdatePlayerInfo();
  };

  document.getElementById('loginForm').onsubmit = function () {
    const form = this;
    closeModal();
    apiFetch(`login?${new URLSearchParams(new FormData(form)).toString()}`)
      .then(response => {
        if (!response.ok) {
          response.text().then(_ => {
            document.getElementById('loginError').innerHTML = getMassagedLabel(localizedMessages.account.login.errors.invalidLogin, true);
            document.getElementById('loginErrorRow').classList.remove('hidden');
            openModal('loginModal');
          });
          return;
        }
        return response.text();
      }).then(sId => {
        if (sId) {
          setCookie('sessionId', sId);
          fetchAndUpdatePlayerInfo();
        }
      }).catch(err => console.error(err));
    return false;
  };

  document.getElementById('registerForm').onsubmit = function () {
    const form = this;
    if (document.getElementById('registerPassword').value !== document.getElementById('registerConfirmPassword').value) {
      document.getElementById('registerError').innerHTML = getMassagedLabel(localizedMessages.account.register.errors.confirmPasswordMismatch, true);
      document.getElementById('registerErrorRow').classList.remove('hidden');
      return false;
    }
    closeModal();
    apiFetch(`register?${new URLSearchParams(new FormData(form)).toString()}`)
      .then(response => {
        if (!response.ok) {
          response.text().then(error => {
            document.getElementById('registerError').innerHTML = getMassagedLabel(localizedMessages.account.register.errors[error === 'user exists' ? 'usernameTaken' : 'invalidCredentials'], true);
            document.getElementById('registerErrorRow').classList.remove('hidden');
            openModal('registerModal');
          });
          return;
        }
        document.getElementById('loginErrorRow').classList.add('hidden');
        openModal('loginModal');
      })
      .catch(err => console.error(err));
    return false;
  };

  document.getElementById('accountSettingsButton').onclick = () => {
    initAccountSettingsModal();
    openModal('accountSettingsModal', null, 'settingsModal');
  };

  const onClickBadgeButton = (prevModal, slotId) => {
    if (slotId && (slotId > badgeSlotCache.length + 1 || Math.ceil(slotId / badgeSlotsPerRow) > badgeSlotRows))
      return;

    const badgeModalContent = document.querySelector('#badgesModal .modalContent');
    badgeModalContent.innerHTML = '';

    const updateBadgesAndOpenModal = () => {
      updateBadges(() => {
        let lastGame = null;
        const badgeCompareFunc = (a, b) => {
          if (a.game !== b.game) {
            if (a.game === gameId)
              return -1;
            if (b.game === gameId)
              return 1;
            return gameIds.indexOf(a.game) < gameIds.indexOf(b.game) ? -1 : 1;
          }
          return 0;
        };
        const badges = [{ badgeId: 'null', game: null}].concat(badgeCache.sort(badgeCompareFunc));
        for (let badge of badges) {
          if (badge.game !== lastGame) {
            const gameHeader = document.createElement('h2');
            gameHeader.classList.add('itemCategoryHeader');
            gameHeader.innerHTML = getMassagedLabel(localizedMessages.games[badge.game], true);
            badgeModalContent.appendChild(gameHeader);
            lastGame = badge.game;
          }
          const item = getBadgeItem(badge, true, true, true);
          if (badge.badgeId === (playerData?.badge || 'null'))
            item.children[0].classList.add('selected');
          if (!item.classList.contains('disabled')) {
            item.onclick = slotId 
              ? () => updatePlayerBadgeSlot(badge.badgeId, slotId, () => {
                updateBadgeSlots(() => {
                  initBadgeGalleryModal();
                  closeModal()
                });
              })
              : () => updatePlayerBadge(badge.badgeId, () => {
                initAccountSettingsModal();
                closeModal();
              });
             
          }
          badgeModalContent.appendChild(item);
        }

        openModal('badgesModal', null, prevModal || null);
      });
    };
    if (!badgeCache.filter(b => !localizedBadges.hasOwnProperty(b.game) || !localizedBadges[b.game].hasOwnProperty(b.badgeId)).length || localizedBadgesIgnoreUpdateTimer)
      updateBadgesAndOpenModal();
    else
      updateLocalizedBadges(updateBadgesAndOpenModal);
  };

  document.getElementById('badgeButton').onclick = () => onClickBadgeButton();
  document.getElementById('accountBadgeButton').onclick = () => onClickBadgeButton('accountSettingsModal');

  document.getElementById('badgeGalleryButton').onclick = () => {
    updateBadgeSlots(() => {
      initBadgeGalleryModal();
      openModal('badgeGalleryModal', null, 'accountSettingsModal');
    });
  };

  const badgeGalleryModalContent = document.querySelector('#badgeGalleryModal .modalContent');

  for (let s = 1; s <= maxBadgeSlotRows * badgeSlotsPerRow; s++) {
    const badgeSlotButton = document.createElement('div');
    badgeSlotButton.classList.add('badgeSlotButton');
    badgeSlotButton.classList.add('badgeItem');
    badgeSlotButton.classList.add('item');
    badgeSlotButton.classList.add('unselectable');
    badgeSlotButton.dataset.slotId = s;
    badgeSlotButton.onclick = () => onClickBadgeButton('badgeGalleryModal', s);
    badgeGalleryModalContent.appendChild(badgeSlotButton);
  }
}

function initAccountSettingsModal() {
  const badgeId = playerData?.badge || 'null';
  const badge = badgeCache.find(b => b.badgeId === badgeId);
  document.getElementById('accountBadgeButton').innerHTML = getBadgeItem(badge || { badgeId: 'null' }, false, true, true).innerHTML;
  document.getElementById('badgeButton').innerHTML = getBadgeItem(badge || { badgeId: 'null' }, false, true).innerHTML;
}

function initBadgeGalleryModal() {
  for (let s = 1; s <= maxBadgeSlotRows * badgeSlotsPerRow; s++) {
    const rowIndex = Math.ceil(s / badgeSlotsPerRow);
    const badgeId = s <= badgeSlotCache.length ? badgeSlotCache[s - 1] : null;
    const badgeSlotButton = document.querySelector(`.badgeSlotButton[data-slot-id='${s}']`);
    if (badgeSlotButton) {
      let badge = badgeId ? badgeCache.find(b => b.badgeId === badgeId) : null;
      if (!badge)
        badge = { badgeId: 'null' };
      badgeSlotButton.classList.toggle('disabled', s > badgeSlotCache.length + 1);
      badgeSlotButton.classList.toggle('hidden', rowIndex > badgeSlotRows);
      badgeSlotButton.innerHTML = getBadgeItem(badge).innerHTML;
    }
  }
}

function getBadgeItem(badge, includeTooltip, emptyIcon, scaled) {
  const badgeId = badge.badgeId;

  const item = document.createElement('div');
  item.classList.add('badgeItem');
  item.classList.add('item');
  item.classList.add('unselectable');

  const badgeContainer = document.createElement('div');
  badgeContainer.classList.add('badgeContainer');
  
  const badgeEl = (badge.unlocked || !badge.secret) && badgeId !== 'null' ? document.createElement('div') : null;

  if (badgeEl) {
    badgeEl.classList.add('badge');
    if (scaled)
      badgeEl.classList.add('scaledBadge');
    badgeEl.style.backgroundImage = `url('images/badge/${badgeId}.png')`;
  } else {
    if (badgeId !== 'null') {
      item.classList.add('locked');
      item.classList.add('disabled');
      badgeContainer.appendChild(getSvgIcon('locked', true));
      badgeContainer.appendChild(document.createElement('div'));
    } else
      badgeContainer.appendChild(emptyIcon ? getSvgIcon('ban', true) : document.createElement('div'));
  }

  if (badgeEl) {
    if (badge?.overlay) {
      const badgeOverlay = document.createElement('div');
      badgeOverlay.classList.add('badgeOverlay');
      badgeOverlay.setAttribute('style', `-webkit-mask-image: ${badgeEl.style.backgroundImage}; mask-image: ${badgeEl.style.backgroundImage};`);
      badgeEl.appendChild(badgeOverlay);
    }

    badgeContainer.appendChild(badgeEl);
    if (!badge.unlocked) {
      item.classList.add('locked');
      item.classList.add('disabled');
      badgeContainer.appendChild(getSvgIcon('locked', true));
    }
  }

  if (includeTooltip) {
    let tooltipContent = '';

    if (badgeId === 'null')
      tooltipContent = `<label>${localizedMessages.badges.null}</label>`;
    else {
      if (localizedBadges.hasOwnProperty(badge.game) && localizedBadges[badge.game].hasOwnProperty(badgeId)) {
        const localizedTooltip = localizedBadges[badge.game][badgeId];
        if (badge.unlocked || !badge.secret) {
          if (localizedTooltip.name)
            tooltipContent += `<h3 class="tooltipTitle">${getMassagedLabel(localizedTooltip.name, true)}</h3>`;
        } else
          tooltipContent += `<h3 class="tooltipTitle">${localizedMessages.badges.locked}</h3>`;
        if ((badge.unlocked || !badge.secret) && localizedTooltip.description)
          tooltipContent += `<div class="tooltipContent">${getMassagedLabel(localizedTooltip.description, true)}</div>`;
        tooltipContent += '<div class="tooltipSpacer"></div>';
        if (badge.mapId)
          tooltipContent += `<span class="tooltipLocation"><label>${getMassagedLabel(localizedMessages.badges.location, true)}</label><span class="tooltipLocationText">{LOCATION}</span></span>`;
        if ((badge.unlocked || !badge.secret) && localizedTooltip.condition) {
          if (badge.unlocked || !badge.secretCondition) {
            let condition = getMassagedLabel(localizedTooltip.condition, true);
            if (badge.seconds) {
              const minutes = Math.floor(badge.seconds / 60);
              const seconds = badge.seconds - minutes * 60;
              condition = condition.replace('{TIME}', localizedMessages.badges.time.replace('{MINUTES}', minutes.toString().padStart(2, '0')).replace('{SECONDS}', seconds.toString().padStart(2, '0')));
            }
            tooltipContent += `<div class="tooltipContent">${condition}</div>`;
          } else
            tooltipContent += `<h3 class="tooltipTitle">${localizedMessages.badges.locked}</h3>`;
        }
      } else
        tooltipContent += `<h3 class="tooltipTitle">${localizedMessages.badges.locked}</h3>`;
        
      tooltipContent += '<label class="tooltipFooter">';
      if (!badge.unlocked && badge.goalsTotal > 0)
        tooltipContent += `${getMassagedLabel(localizedMessages.badges.goalProgress).replace('{CURRENT}', badge.goals).replace('{TOTAL}', badge.goalsTotal)}<br>`;

      const percentMultiplier = badge.percent < 1 ? 100 : 10;
      tooltipContent += `${getMassagedLabel(localizedMessages.badges.percentUnlocked).replace('{PERCENT}', Math.floor(badge.percent * percentMultiplier) / percentMultiplier)}`;

      if ((badge.unlocked || !badge.secret) && badge.art)
        tooltipContent += `<small class="tooltipCornerText">${getMassagedLabel(localizedMessages.badges.artCredit).replace('{ARTIST}', badge.art)}</small>`

      tooltipContent += '</label>';
        
      if (tooltipContent) {
        const baseTooltipContent = tooltipContent;

        const assignTooltip = () => addTooltip(item, tooltipContent, false, false, !!badge.mapId);

        if (badge.mapId) {
          const mapId = badge.mapId.toString().padStart(4, '0');
          const setTooltipLocation = () => {
            if (gameLocalizedMapLocations[badge.game] && gameLocalizedMapLocations[badge.game].hasOwnProperty(mapId))
              tooltipContent = baseTooltipContent.replace('{LOCATION}', getLocalizedMapLocationsHtml(badge.game, mapId, '0000', badge.mapX, badge.mapY, getInfoLabel("&nbsp;|&nbsp;")));
            else
              tooltipContent = baseTooltipContent.replace('{LOCATION}', getInfoLabel(getMassagedLabel(localizedMessages.location.unknownLocation)));
            assignTooltip();
          }
          if (gameLocalizedMapLocations.hasOwnProperty(badge.game))
            setTooltipLocation();
          else {
            tooltipContent = baseTooltipContent.replace('{LOCATION}', getInfoLabel(getMassagedLabel(localizedMessages.location.queryingLocation)));
            initLocations(globalConfig.lang, badge.game, setTooltipLocation);
          }
        } else
          assignTooltip();
      }
    }
  }

  item.appendChild(badgeContainer);

  return item;
}

function updateBadges(callback) {
  apiFetch(`badge?command=list`)
    .then(response => {
      if (!response.ok)
        throw new Error(response.statusText);
      return response.json();
    })
    .then(badges => {
      badgeCache = badges.map(badge => {
        return { badgeId: badge.badgeId, game: badge.game, mapId: badge.mapId, mapX: badge.mapX, mapY: badge.mapY, seconds: badge.seconds, secret: badge.secret, secretCondition: badge.secretCondition, overlay: badge.overlay, art: badge.art, percent: badge.percent, goals: badge.goals, goalsTotal: badge.goalsTotal, unlocked: badge.unlocked };
      });
      const newUnlockedBadges = badges.filter(b => b.newUnlock);
      for (let b = 0; b < newUnlockedBadges.length; b++)
        showAccountToastMessage('badgeUnlocked', 'info');
      if (callback)
        callback();
    })
    .catch(err => console.error(err));
}

function updateBadgeSlots(callback) {
  apiFetch(`badge?command=slotList`)
    .then(response => {
      if (!response.ok)
        throw new Error(response.statusText);
      return response.json();
    })
    .then(badgeSlots => {
      badgeSlotCache = badgeSlots;
      if (callback)
        callback();
  })
  .catch(err => console.error(err));
}

function updatePlayerBadge(badgeId, callback) {
  apiFetch(`badge?command=set&id=${badgeId}`)
    .then(response => {
      if (!response.ok)
        throw new Error(response.statusText);
      syncPlayerData(playerUuids[-1], playerData?.rank, playerData?.account, badgeId, -1);
      if (callback)
        callback();
    })
    .catch(err => console.error(err));
}

function updatePlayerBadgeSlot(badgeId, slotId, callback) {
  apiFetch(`badge?command=slotSet&id=${badgeId}&slot=${slotId}`)
    .then(response => {
      if (!response.ok)
        throw new Error(response.statusText);
      badgeSlotCache = response;
      syncPlayerData(playerUuids[-1], playerData?.rank, playerData?.account, response[0], -1);
      if (callback)
        callback();
    })
    .catch(err => console.error(err));
}

function updateLocalizedBadges(callback) {
  if (localizedBadgesIgnoreUpdateTimer)
    clearInterval(localizedBadgesIgnoreUpdateTimer);
    
  fetch(`lang/badge/${globalConfig.lang}.json`)
    .then(response => response.json())
    .then(function (jsonResponse) {
      localizedBadges = jsonResponse;
      localizedBadgesIgnoreUpdateTimer = setTimeout(() => localizedBadgesIgnoreUpdateTimer = null, 300000);
      if (callback)
        callback(true);
    })
    .catch(err => console.error(err));
}

function addPlayerBadgeGalleryTooltip(badgeElement, playerName, systemName) {
  tippy(badgeElement, Object.assign({
    trigger: 'click',
    interactive: true,
    content: `<div class="tooltipContent">${getMassagedLabel(localizedMessages.badgeGallery.loading, true)}</div>`,
    appendTo: document.getElementById('layout'),
    onShow(instance) {
      apiFetch(`badge?command=playerSlotList&player=${playerName}`)
        .then(response => {
          if (!response.ok)
            throw new Error(response.statusText);
          return response.json();
        })
        .then(badgeSlots => {
          const tooltipContent = document.createElement('div');
          tooltipContent.classList.add('tooltipContent');

          const tooltipTitle = document.createElement('h4');
          tooltipTitle.classList.add('tooltipTitle');
          tooltipTitle.innerHTML = getMassagedLabel(localizedMessages.badgeGallery.label, true).replace('{PLAYER}', playerName);

          const badgeSlotsContainer = document.createElement('div');
          badgeSlotsContainer.classList.add('badgeSlotsContainer');

          for (badgeId of badgeSlots) {
            const badgeSlot = document.createElement('div');
            badgeSlot.classList.add('badgeSlot');
            badgeSlot.classList.add('badge');

            const badgeUrl = `images/badge/${badgeId}.png`;

            badgeSlot.style.backgroundImage = `url('${badgeUrl}')`;

            if (overlayBadgeIds.indexOf(badgeId) > -1) {
              const badgeSlotOverlay = document.createElement('div');
              badgeSlotOverlay.classList.add('badgeSlotOverlay');
              badgeSlotOverlay.classList.add('badgeOverlay');
              badgeSlotOverlay.setAttribute('style', `-webkit-mask-image: url('${badgeUrl}'); mask-image: url('${badgeUrl}');`);

              badgeSlot.appendChild(badgeSlotOverlay);
            }

            badgeSlotsContainer.appendChild(badgeSlot);

            // Doesn't work at the moment, likely due to nested tippy instances
            if (localizedBadges) {
              const badgeGame = Object.keys(localizedBadges).find(game => {
                return Object.keys(localizedBadges[game]).find(b => b === badgeId);
              });
              if (badgeGame)
                addTooltip(badgeSlot, getMassagedLabel(localizedBadges[badgeGame][badgeId].name, true), true, false, true);
            }
          }

          if (systemName) {
            if (gameUiThemes.indexOf(systemName) === -1)
              systemName = getDefaultUiTheme();
            const parsedSystemName = systemName.replace(' ', '_');
            const tippyBox = instance.popper.children[0];
            tippyBox.setAttribute('style', `background-image: var(--container-bg-image-url-${parsedSystemName}) !important; border-image: var(--border-image-url-${parsedSystemName}) 8 repeat !important;`);
            tooltipTitle.setAttribute('style', `color: var(--base-color-${parsedSystemName}); background-image: var(--base-gradient-${parsedSystemName}) !important; filter: drop-shadow(1.5px 1.5px var(--shadow-color-${parsedSystemName}));`);
          }

          tooltipContent.appendChild(tooltipTitle);
          tooltipContent.appendChild(badgeSlotsContainer);

          instance.setContent(tooltipContent.outerHTML);
        })
        .catch(err => {
          console.error(err);
          instance.setContent('');
        });
    }
  }, tippyConfig));
}

// EXTERNAL
function onBadgeUpdateRequested() {
  if (sessionId)
    updateBadges();
}

function showAccountToastMessage(key, icon, username) {
  if (!notificationConfig.account.all || (notificationConfig.account.hasOwnProperty(key) && !notificationConfig.account[key]))
    return;
  let message = getMassagedLabel(localizedMessages.toast.account[key], true).replace('{USER}', username);
  showToastMessage(message, icon, true);
}