<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import { onMount } from 'svelte';

	export let data: PageData;
	export let form: ActionData;

	// S'assurer que la page settings utilise le padding standard
	onMount(() => {
		const container = document.querySelector('main.container');
		if (container) {
			container.classList.remove('dashboard-padding');
		}
	});
</script>

<section class="hero">
	<h1>Settings<span class="dot">.</span></h1>
	<p class="subtitle">Manage qBittorrent Instances</p>
</section>

<section class="metrics-grid">
	<div class="metric-card">
		<div class="metric-label">Add New Instance</div>
		<form method="POST">
			<input name="name" type="text" placeholder="Instance Name" required />
			<input name="url" type="url" placeholder="URL (http://...)" required />
			<input name="user" type="text" placeholder="Username" required />
			<input name="pass" type="password" placeholder="Password" required />
			<button type="submit">Add Instance</button>
		</form>
	</div>

	<div class="metric-card large-card">
		<div class="metric-label">Current Instances</div>
		<div class="instance-list">
			{#if data.instances.length > 0}
				{#each data.instances as instance (instance.id)}
					<div class="instance-row">
						<span class="instance-name">{instance.name}</span>
						<span class="instance-url">{instance.url}</span>
						<button class="delete-btn">Delete</button>
					</div>
				{/each}
			{:else}
				<p class="empty-state">No instances configured yet.</p>
			{/if}
		</div>
	</div>
</section>

<style>
	.hero {
		margin-bottom: calc(var(--spacing-unit) * 4);
		padding-bottom: calc(var(--spacing-unit) * 2);
		border-bottom: 1px solid var(--border-color);
	}

	h1 {
		font-size: 5rem;
		font-weight: 700;
		line-height: 1;
		margin-bottom: var(--spacing-unit);
	}

	.container {
		max-width: 1400px;
		margin: 0 auto;
		padding: calc(var(--spacing-unit) * 4);
	}

	.dot {
		color: var(--accent-color);
	}

	.subtitle {
		font-size: 1.5rem;
		color: var(--secondary-text-color);
		margin-top: var(--spacing-unit);
	}

	.metrics-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
		gap: calc(var(--spacing-unit) * 2);
	}

	.metric-card {
		background-color: var(--card-background-color);
		border: 1px solid var(--border-color);
		padding: calc(var(--spacing-unit) * 2);
		border-radius: 5px;
		display: flex;
		flex-direction: column;
		min-height: 200px;
	}

	.large-card {
		grid-column: span 2;
	}

	.metric-label {
		font-size: 0.9rem;
		color: var(--secondary-text-color);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-bottom: var(--spacing-unit);
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		flex-grow: 1;
		justify-content: center;
	}

	input {
		width: 100%;
		padding: 0.8rem;
		border: 1px solid var(--border-color);
		border-radius: 4px;
		font-size: 1rem;
		font-family: var(--font-family-main);
		background-color: var(--background-color);
		color: var(--primary-text-color);
	}

	button {
		padding: 0.8rem;
		border-radius: 4px;
		font-size: 1rem;
		font-weight: 700;
		cursor: pointer;
		border: 1px solid var(--primary-text-color);
		background-color: var(--primary-text-color);
		color: var(--card-background-color);
		transition: all 0.3s ease;
	}

	button:hover {
		background-color: var(--accent-color);
		border-color: var(--accent-color);
	}

	.instance-list {
		display: flex;
		flex-direction: column;
		flex-grow: 1;
	}

	.instance-row {
		display: grid;
		grid-template-columns: 1fr 2fr auto;
		align-items: center;
		padding: 0.75rem;
		border-bottom: 1px solid var(--border-color);
	}

	.instance-row:last-child {
		border-bottom: none;
	}

	.instance-name {
		font-weight: 700;
	}

	.instance-url {
		font-family: var(--font-family-mono);
		color: var(--secondary-text-color);
	}

	.delete-btn {
		background: transparent;
		color: var(--secondary-text-color);
		border: none;
		padding: 0.5rem;
		cursor: pointer;
		transition: color 0.3s ease;
	}

	.delete-btn:hover {
		color: #dc3545;
	}

	.empty-state {
		text-align: center;
		color: var(--secondary-text-color);
		padding: 1rem;
		flex-grow: 1;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	@media (max-width: 900px) {
		.large-card {
			grid-column: span 1;
		}
	}

	@media (max-width: 600px) {
		.metrics-grid {
			grid-template-columns: 1fr;
		}

		.hero h1 {
			font-size: 3rem;
		}
	}

	/* Dark mode styles */
	body.dark-mode .instance-row,
	body.dark-mode .status-settings,
	body.dark-mode .dropdown {
		background-color: var(--card-background-color);
		border-color: var(--border-color);
	}

	body.dark-mode .instance-name,
	body.dark-mode .instance-url {
		color: var(--primary-text-color);
	}

	body.dark-mode .delete-btn {
		color: var(--secondary-text-color);
		border-color: var(--secondary-text-color);
	}

	body.dark-mode .delete-btn:hover {
		color: #dc3545;
		border-color: #dc3545;
	}
</style>
