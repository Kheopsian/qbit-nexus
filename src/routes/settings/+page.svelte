<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import { onMount } from 'svelte';

	export let data: PageData;
	export let form: ActionData;

	// État pour gérer l'édition des instances
	let editingId: number | null = null;
	let editName = '';
	let editUrl = '';
	let editUser = '';
	let editPass = '';
	let editConfigPath = '';

	// S'assurer que la page settings utilise le padding standard
	onMount(() => {
		const container = document.querySelector('main.container');
		if (container) {
			container.classList.remove('dashboard-padding');
		}
	});

	// Fonction pour commencer l'édition d'une instance
	function startEdit(instance: any) {
		editingId = instance.id;
		editName = instance.name;
		editUrl = instance.url;
		editUser = instance.user;
		editPass = instance.pass;
		editConfigPath = instance.configPath || '';
	}

	// Fonction pour annuler l'édition
	function cancelEdit() {
		editingId = null;
		editName = '';
		editUrl = '';
		editUser = '';
		editPass = '';
		editConfigPath = '';
	}
</script>

<section class="hero">
	<h1>Settings<span class="dot">.</span></h1>
	<p class="subtitle">Manage qBittorrent Instances</p>
</section>

<section class="metrics-grid">
	<div class="metric-card">
		<div class="metric-label">Add New Instance</div>
		<form method="POST" action="?/add">
			<input name="name" type="text" placeholder="Instance Name" required />
			<input name="url" type="url" placeholder="URL (http://...)" required />
			<input name="user" type="text" placeholder="Username" required />
			<input name="pass" type="password" placeholder="Password" required />
			<input name="configPath" type="text" placeholder="Config Path (optional)" />
			<button type="submit">Add Instance</button>
		</form>
	</div>

	<div class="metric-card large-card">
		<div class="metric-label">Current Instances</div>
		<div class="instance-list">
			{#if data.instances.length > 0}
				{#each data.instances as instance (instance.id)}
					{#if editingId === instance.id}
						<!-- Formulaire d'édition -->
						<div class="instance-row editing">
							<form method="POST" action="?/update" class="edit-form">
								<input type="hidden" name="id" value={instance.id} />
								<div class="edit-fields">
									<input
										type="text"
										name="name"
										bind:value={editName}
										placeholder="Instance Name"
										required
									/>
									<input
										type="url"
										name="url"
										bind:value={editUrl}
										placeholder="Instance URL"
										required
									/>
									<input
										type="text"
										name="user"
										bind:value={editUser}
										placeholder="Username"
										required
									/>
									<input
										type="password"
										name="pass"
										bind:value={editPass}
										placeholder="Password"
										required
									/>
									<input
										type="text"
										name="configPath"
										bind:value={editConfigPath}
										placeholder="Config Path (optional)"
									/>
								</div>
								<div class="edit-actions">
									<button type="submit" class="save-btn">Save</button>
									<button type="button" class="cancel-btn" on:click={cancelEdit}>Cancel</button>
								</div>
							</form>
						</div>
					{:else}
						<!-- Affichage normal de l'instance -->
						<div class="instance-row">
							<span class="instance-name">{instance.name}</span>
							<span class="instance-url">{instance.url}</span>
							<div class="instance-actions">
								<button class="edit-btn" on:click={() => startEdit(instance)}>Edit</button>
								<form method="POST" action="?/delete">
									<input type="hidden" name="id" value={instance.id} />
									<button type="submit" class="delete-btn">Delete</button>
								</form>
							</div>
						</div>
					{/if}
				{/each}
			{:else}
				<p class="empty-state">No instances configured yet.</p>
			{/if}
		</div>
	</div>

	<div class="metric-card">
		<div class="metric-label">Visible Statuses</div>
		<div class="status-settings">
			{#if data.settings && data.settings.visibleStatuses}
				{#each data.settings.visibleStatuses as status}
					<div class="status-item">
						<span class="status-name">{status}</span>
					</div>
				{/each}
			{:else}
				<p class="empty-state">No visible statuses configured.</p>
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

	/* Status settings styles */
	.status-settings {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		flex-grow: 1;
	}

	.status-item {
		display: flex;
		align-items: center;
		padding: 0.5rem;
		border-bottom: 1px solid var(--border-color);
	}

	.status-item:last-child {
		border-bottom: none;
	}

	.status-name {
		font-weight: 400;
	}

	/* Dark mode styles */
	body.dark-mode .instance-row,
	body.dark-mode .status-settings,
	body.dark-mode .dropdown {
		background-color: var(--card-background-color);
		border-color: var(--border-color);
	}

	body.dark-mode .instance-name,
	body.dark-mode .instance-url,
	body.dark-mode .status-name {
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

	/* Styles pour l'édition des instances */
	.editing {
		flex-direction: column;
		gap: 1rem;
	}

	.edit-fields {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		width: 100%;
	}

	.edit-fields input {
		width: 100%;
		padding: 0.5rem;
		border: 1px solid var(--border-color);
		border-radius: 4px;
		font-size: 0.9rem;
	}

	.edit-actions {
		display: flex;
		gap: 0.5rem;
	}

	.edit-actions button {
		padding: 0.5rem 1rem;
		border-radius: 4px;
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
		border: 1px solid var(--primary-text-color);
		background-color: var(--primary-text-color);
		color: var(--card-background-color);
		transition: all 0.3s ease;
	}

	.edit-actions .cancel-btn {
		background-color: transparent;
		color: var(--primary-text-color);
	}

	.edit-actions .save-btn:hover {
		background-color: var(--accent-color);
		border-color: var(--accent-color);
	}

	.edit-actions .cancel-btn:hover {
		background-color: var(--border-color);
	}

	.instance-actions {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.edit-btn {
		background: transparent;
		color: var(--secondary-text-color);
		border: none;
		padding: 0.5rem;
		cursor: pointer;
		transition: color 0.3s ease;
	}

	.edit-btn:hover {
		color: var(--accent-color);
	}

	/* Dark mode styles pour l'édition */
	body.dark-mode .edit-fields input {
		background-color: var(--card-background-color);
		color: var(--primary-text-color);
		border-color: var(--border-color);
	}

	body.dark-mode .edit-actions button {
		border-color: var(--primary-text-color);
		background-color: var(--primary-text-color);
		color: var(--card-background-color);
	}

	body.dark-mode .edit-actions .cancel-btn {
		background-color: transparent;
		color: var(--primary-text-color);
	}

	body.dark-mode .edit-btn {
		color: var(--secondary-text-color);
	}

	body.dark-mode .edit-btn:hover {
		color: var(--accent-color);
	}
</style>
