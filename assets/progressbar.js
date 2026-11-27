
(function () {
  if (window.freeShippingProgressInitialized) return;
  window.freeShippingProgressInitialized = true;

  function formatMoney(cents) {
    if (window.Shopify && typeof Shopify.formatMoney === "function") {
      return Shopify.formatMoney(
        cents,
        window.theme?.moneyFormat || Shopify.money_format
      );
    }

    const currency = window.Shopify?.currency?.active || "INR";

    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: currency
    }).format(cents / 100);
  }

  async function updateFreeShippingProgress() {
    try {
      const response = await fetch("/cart.js", {
        headers: { Accept: "application/json" }
      });

      if (!response.ok) return;

      const cart = await response.json();

      document.querySelectorAll("[data-free-shipping-progress]").forEach((wrapper) => {
        const threshold = Number(wrapper.dataset.threshold);
        const total = cart.total_price;
        const remaining = Math.max(threshold - total, 0);
        const progress = Math.min((total / threshold) * 100, 100);

        const message = wrapper.querySelector(
          ".free-shipping-progress__message"
        );

        const fill = wrapper.querySelector(
          ".free-shipping-progress__fill"
        );

        const labels = wrapper.querySelectorAll(
          ".free-shipping-progress__labels span"
        );

        wrapper.dataset.cartTotal = total;

        if (remaining > 0) {
          message.innerHTML =
            "You're only <strong>" +
            formatMoney(remaining) +
            "</strong> away from free shipping!";

          message.classList.remove("success");
        } else {
          message.textContent =
            "Congratulations! You've unlocked free shipping!";

          message.classList.add("success");
        }

        fill.style.width = progress + "%";

        labels[0].textContent = formatMoney(total);
        labels[1].textContent = formatMoney(threshold);
      });
    } catch (error) {
      console.error("Free shipping progress error:", error);
    }
  }

  // Detect Shopify AJAX cart updates.
  const originalFetch = window.fetch;

  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);

    const url = typeof args[0] === "string"
      ? args[0]
      : args[0]?.url || "";

    if (/\/cart\/(add|change|update|clear)(\.js)?(\?|$)/.test(url)) {
      response.clone().text().then(() => {
        setTimeout(updateFreeShippingProgress, 100);
      });
    }

    return response;
  };

  // Support themes using XMLHttpRequest.
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...args) {
    this._isCartRequest =
      /\/cart\/(add|change|update|clear)(\.js)?(\?|$)/.test(url);

    return originalOpen.call(this, method, url, ...args);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    if (this._isCartRequest) {
      this.addEventListener("loadend", function () {
        setTimeout(updateFreeShippingProgress, 100);
      });
    }

    return originalSend.apply(this, args);
  };

  // Initial page load.
  document.addEventListener("DOMContentLoaded", updateFreeShippingProgress);

  // Support themes that dispatch cart update events.
  document.addEventListener("cart:updated", updateFreeShippingProgress);
  document.addEventListener("cart:refresh", updateFreeShippingProgress);
})();

/* =================================
   GIFT WRAPPING FUNCTIONALITY
================================= */

document.addEventListener("change", async function (event) {

  const checkbox = event.target.closest("[data-gift-wrap]");

  if (!checkbox) return;

  const previousValue = !checkbox.checked;

  const status = checkbox
    .closest(".cart-extra-gift")
    ?.querySelector("[data-gift-wrap-status]");

  checkbox.disabled = true;

  if (status) {
    status.textContent = "Saving...";
  }

  try {

    const response = await fetch(
      `${window.Shopify?.routes?.root || "/"}cart/update.js`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({
          attributes: {
            "Gift wrapping": checkbox.checked ? "Yes" : "No"
          }
        })
      }
    );

    if (!response.ok) {
      throw new Error("Unable to update gift wrapping");
    }

    if (status) {
      status.textContent = checkbox.checked
        ? "Gift wrapping added successfully."
        : "Gift wrapping removed.";
    }

  } catch (error) {

    checkbox.checked = previousValue;

    if (status) {
      status.textContent = "Something went wrong. Please try again.";
    }

    console.error("Gift wrapping error:", error);

  } finally {
    checkbox.disabled = false;
  }

});

/* Dynamic estimated delivery date */

(function () {
  function addBusinessDays(startDate, days) {
    const date = new Date(
      startDate.getFullYear(),
      startDate.getMonth(),
      startDate.getDate()
    );

    let addedDays = 0;

    while (addedDays < days) {
      date.setDate(date.getDate() + 1);

      // Skip Saturday and Sunday
      if (date.getDay() !== 0 && date.getDay() !== 6) {
        addedDays++;
      }
    }

    return date;
  }

  function formatDeliveryRange(startDate, endDate) {
    const options = {
      day: "numeric",
      month: "short",
      year: "numeric"
    };

    const start = new Intl.DateTimeFormat("en-IN", options)
      .formatToParts(startDate);

    const end = new Intl.DateTimeFormat("en-IN", options)
      .formatToParts(endDate);

    const getPart = (parts, type) =>
      parts.find(part => part.type === type)?.value || "";

    const startDay = getPart(start, "day");
    const endDay = getPart(end, "day");
    const startMonth = getPart(start, "month");
    const endMonth = getPart(end, "month");
    const startYear = getPart(start, "year");
    const endYear = getPart(end, "year");

    if (startMonth === endMonth && startYear === endYear) {
      return `${startDay}–${endDay} ${endMonth} ${endYear}`;
    }

    return `${new Intl.DateTimeFormat("en-IN", options).format(startDate)} – ${new Intl.DateTimeFormat("en-IN", options).format(endDate)}`;
  }

  function updateEstimatedDelivery() {
    const deliveryElements = document.querySelectorAll(
      "[data-estimated-delivery]"
    );

    deliveryElements.forEach(element => {
      const minDays = parseInt(element.dataset.minDays, 10) || 3;
      const maxDays = parseInt(element.dataset.maxDays, 10) || 5;

      const today = new Date();

      const startDate = addBusinessDays(today, minDays);
      const endDate = addBusinessDays(today, maxDays);

      const deliveryText = formatDeliveryRange(
        startDate,
        endDate
      );

      if (element.textContent.trim() !== deliveryText) {
        element.textContent = deliveryText;
      }
    });
  }

  // Initial calculation
  updateEstimatedDelivery();

  // Update if Shopify dynamically replaces cart drawer content
  const observer = new MutationObserver(updateEstimatedDelivery);

  if (document.body) {
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  document.addEventListener(
    "shopify:section:load",
    updateEstimatedDelivery
  );
})();