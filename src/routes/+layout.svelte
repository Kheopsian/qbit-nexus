<script>
	import '../app.css';
</script>

<div class="container">
	<header class="header">
		<div class="logo">QBIT-NEXUS / STATUS</div>
		<nav class="nav">
			<a href="/" class="nav-item">DASHBOARD</a>
			<a href="/settings" class="nav-item">SETTINGS</a>
		</nav>
	</header>

	<main class="main-content">
		<slot />
	</main>
</div>

<style global>
	/* Styles globaux extraits de ton fichier style.css */
	:root {
		--primary-text-color: #1a1a1a;
		--secondary-text-color: #666;
		--background-color: #f7f7f7; /* Le fond gris clair */
		--border-color: #e0e0e0;
		--accent-color: #007bff;
		--font-family-main: 'Inter', sans-serif;
		--font-family-mono: 'Roboto Mono', monospace;
		--spacing-unit: 1rem;
	}

	* {
		box-sizing: border-box;
		margin: 0;
		padding: 0;
	}

	body {
		font-family: var(--font-family-main);
		color: var(--primary-text-color);
		background-color: var(--background-color);
		line-height: 1.6;
	}

	.container {
		max-width: 1400px;
		margin: 0 auto;
		padding: 0 calc(var(--spacing-unit) * 4);
	}

	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--spacing-unit) 0;
		border-bottom: 1px solid var(--border-color);
	}

	.logo {
		font-weight: 700;
		font-size: 1.1rem;
		letter-spacing: 0.05em;
	}

	.nav {
		display: flex;
		gap: calc(var(--spacing-unit) * 2);
	}

	.nav-item {
		text-decoration: none;
		color: var(--primary-text-color);
		font-weight: 400;
		font-size: 0.95rem;
		text-transform: uppercase;
	}

	.main-content {
		padding-top: calc(var(--spacing-unit) * 4);
	}
</style>
