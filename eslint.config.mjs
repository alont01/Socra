import nextConfig from "eslint-config-next";

export default [
  ...nextConfig,
  {
    rules: {
      // The fetch-on-mount + setInterval polling pattern (admin dashboard,
      // HomeworkManager) calls an async loader in an effect; its setState calls
      // run after `await`, not synchronously. This React-19 rule flags it as a
      // false positive and fails the production build, so disable it.
      "react-hooks/set-state-in-effect": "off",
    },
  },
];
