<script lang="ts">
	import type { ActionData, PageData } from './$types';

	export let data: PageData;
	export let form: ActionData;
</script>

<section class="hero">
	<h1>Settings<span class="dot">.</span></h1>
	<p class="subtitle">Manage qBittorrent Instances</p>
</section>

<div class="metrics-grid">
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
</div>

<style>
	.hero {
		margin-bottom: calc(var(--spacing-unit) * 4);
	}

	h1 {
		font-size: 5rem;
		font-weight: 700;
		line-height: 1;
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
		grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
		gap: calc(var(--spacing-unit) * 2);
	}

	.metric-card {
		background-color: #fff;
		border: 1px solid var(--border-color);
		padding: calc(var(--spacing-unit) * 2);
		border-radius: 5px;
	}
	.large-card {
		grid-column: span 2;
	}

	.metric-label {
		font-size: 0.9rem;
		color: var(--secondary-text-color);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-bottom: 1.5rem;
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	input {
		width: 100%;
		padding: 0.8rem;
		border: 1px solid var(--border-color);
		border-radius: 4px;
		font-size: 1rem;
	}

	button {
		padding: 0.8rem;
		border-radius: 4px;
		font-size: 1rem;
		font-weight: 700;
		cursor: pointer;
		border: 1px solid var(--primary-text-color);
		background-color: var(--primary-text-color);
		color: #fff;
	}

	.instance-list {
		display: flex;
		flex-direction: column;
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
	}
	.delete-btn:hover {
		color: #dc3545;
	}
	.empty-state {
		text-align: center;
		color: var(--secondary-text-color);
		padding: 1rem;
	}
</style>
