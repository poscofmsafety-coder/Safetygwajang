/* AdSense review build
 * Manual inline ad injection is intentionally disabled.
 * Keep the AdSense loader in indexable publisher-content pages for site ownership/review.
 * Re-introduce ad units only after approval and only where substantial publisher content exists.
 */
window.InlineAds = {
  inject: function () { return 0; }
};
