The Windows portable package includes upstream Node.js, Eclipse Temurin JDK, and Gradle archives under `.runtime/downloads`. Their upstream notices and licenses ship inside each runtime archive and remain available after extraction.

- Node.js 24.21.0 is distributed under the MIT license; see the Node archive's `LICENSE` file.
- Eclipse Temurin JDK 25.0.4.1+1 is distributed under GPL-2.0 with the Classpath Exception. The extracted JDK includes its `legal/` notices.
- Gradle 9.8.2 is distributed under the Apache License 2.0. The Gradle archive includes its license and notice files.

The app checks each embedded runtime archive against the recorded SHA-256 value before extracting it. It does not modify system PATH, JAVA_HOME or Java installations.

The site bundles Geist Mono variable Latin regular from `@fontsource-variable/geist-mono` under the SIL Open Font License 1.1. The font license is included as `Geist-Mono-OFL-1.1.txt`.
