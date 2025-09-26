<script>
	import '../app.css';
</script>

<header class="header">
	<div class="logo">
		<a href="/" style="text-decoration: none; color: inherit">QBIT / NEXUS</a>
	</div>
	<nav class="nav">
		<a href="/" class="nav-item">DASHBOARD</a>
		<a href="/settings" class="nav-item">SETTINGS</a>
		<div id="theme-switcher" class="nav-item">
			<i class="fas fa-moon"></i>
		</div>
	</nav>
</header>

<main id="main-container" class="container">
	<slot />
</main>

<style global>
	/* Les styles de base sont maintenant dans app.css */

	/* Style pour le container avec padding réduit (2 unités) */
	#main-container.dashboard-padding {
		padding: calc(var(--spacing-unit) * 2) !important;
	}

	/* Style par défaut pour le container (padding de 4 unités) */
	#main-container.container {
		padding: calc(var(--spacing-unit) * 4);
	}
</style>
