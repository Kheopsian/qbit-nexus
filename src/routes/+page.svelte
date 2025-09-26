<script lang="ts">
	import type { PageData } from './$types';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';

	export let data: PageData;

	let selectedTorrent: any = null;
	let showStatusSettings = false;
	let selectedStatuses: string[] = [...data.config.settings.visibleStatuses];
	let visibleStatuses: string[];
	let settingsForm: HTMLFormElement;

	$: selectedStatuses = [...data.config.settings.visibleStatuses];

	// --- TRI DES COLONNES ---
	let sortKey = 'name';
	let sortDirection: 'asc' | 'desc' = 'asc';

	function toggleSort(key: string) {
		if (sortKey === key) {
			sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
		} else {
			sortKey = key;
			sortDirection = 'asc';
		}
	}

	function parseSize(size: string): number {
		const match = size.match(/(\d+(?:\.\d+)?)\s*(GB|MB|KB|B)/);
		if (!match) return 0;
		const num = parseFloat(match[1]);
		const unit = match[2];
		const multipliers: { [key: string]: number } = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3 };
		return num * multipliers[unit];
	}

	function parseSpeed(speed: string): number {
		if (speed === '0 B/s') return 0;
		const match = speed.match(/(\d+(?:\.\d+)?)\s*(MB|KB|B)\/s/);
		if (!match) return 0;
		const num = parseFloat(match[1]);
		const unit = match[2];
		const multipliers: { [key: string]: number } = { 'B/s': 1, 'KB/s': 1024, 'MB/s': 1024 ** 2 };
		return num * multipliers[unit + '/s'];
	}

	$: sortedTorrents = [...filteredTorrents].sort((a, b) => {
		let aVal: any = a[sortKey as keyof typeof a];
		let bVal: any = b[sortKey as keyof typeof b];

		if (sortKey === 'progress') {
			aVal = a.progress;
			bVal = b.progress;
		} else if (sortKey === 'size') {
			aVal = parseSize(a.size);
			bVal = parseSize(b.size);
		} else if (sortKey === 'dl_speed') {
			aVal = parseSpeed(a.dl_speed);
			bVal = parseSpeed(b.dl_speed);
		} else if (sortKey === 'ul_speed') {
			aVal = parseSpeed(a.ul_speed);
			bVal = parseSpeed(b.ul_speed);
		}

		if (typeof aVal === 'number' && typeof bVal === 'number') {
			return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
		} else {
			aVal = String(aVal).toLowerCase();
			bVal = String(bVal).toLowerCase();
			if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
			if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
			return 0;
		}
	});

	// --- REDIMENSIONNEMENT DES COLONNES ---
	let columnWidths = ['auto', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto'];
	let resizingColumn: number | null = null;
	let startX = 0;
	let startWidth = 0;

	function startResize(event: MouseEvent, columnIndex: number) {
		resizingColumn = columnIndex;
		startX = event.clientX;
		const th = (event.target as HTMLElement).parentElement as HTMLElement;
		startWidth = th.offsetWidth;
		document.addEventListener('mousemove', resize);
		document.addEventListener('mouseup', stopResize);
	}

	function resize(event: MouseEvent) {
		if (resizingColumn !== null) {
			const deltaX = event.clientX - startX;
			const newWidth = Math.max(50, startWidth + deltaX); // Minimum 50px
			columnWidths[resizingColumn] = `${newWidth}px`;
		}
	}

	function stopResize() {
		resizingColumn = null;
		document.removeEventListener('mousemove', resize);
		document.removeEventListener('mouseup', stopResize);
	}

	// --- FILTRES ---
	let searchFilter = '';
	let statusFilter = '';
	let instanceFilter = '';
	let categoryFilter = '';
	let tagFilter = '';

	// --- ÉTATS DES DROPDOWNS ---
	let statusDropdownOpen = false;
	let instanceDropdownOpen = false;
	let categoryDropdownOpen = false;
	let tagDropdownOpen = false;

	// --- DONNÉES MOCKÉES ---
	const instances = [
		{ name: 'Seedbox-FR', status: 'online', dl: '80.2 MB/s', ul: '20.1 MB/s' },
		{ name: 'Serveur-US', status: 'online', dl: '32.3 MB/s', ul: '25.7 MB/s' }
	];

	const globalStats = {
		downloadSpeed: '112.5 MB/s',
		uploadSpeed: '45.8 MB/s',
		activeTorrents: 87,
		totalTorrents: 1245,
		totalDownloaded: '2.3 TB',
		totalUploaded: '1.8 TB',
		ratio: '1.27'
	};

	// --- STATUTS DISPONIBLES ---
	const allStatuses = [
		'Downloading',
		'Seeding',
		'Completed',
		'Running',
		'Stopped',
		'Active',
		'Inactive',
		'Stalled',
		'Stalled uploading',
		'Stalled downloading',
		'Checking',
		'Moving',
		'Errored'
	];

	$: visibleStatuses =
		data.config.settings.visibleStatuses.length > 0
			? data.config.settings.visibleStatuses
			: allStatuses;

	// --- ICÔNES POUR LES STATUTS ---
	function getStatusIcon(status: string): string {
		switch (status) {
			case '':
				return '<i class="fas fa-chart-bar" style="color: var(--accent-color)"></i>';
			case 'Allocating':
				return '<i class="fas fa-folder" style="color: var(--secondary-text-color)"></i>';
			case 'Checking':
				return '<i class="fas fa-search" style="color: var(--accent-color)"></i>';
			case 'Downloading':
				return '<i class="fas fa-download" style="color: var(--accent-color)"></i>';
			case 'Errored':
				return '<i class="fas fa-exclamation-triangle" style="color: #dc3545"></i>';
			case 'Forced downloading':
				return '<i class="fas fa-bolt" style="color: #ff9800"></i><i class="fas fa-download" style="color: var(--accent-color)"></i>';
			case 'Forced seeding':
				return '<i class="fas fa-bolt" style="color: #ff9800"></i><i class="fas fa-seedling" style="color: #28a745"></i>';
			case 'Forced uploading':
				return '<i class="fas fa-bolt" style="color: #ff9800"></i><i class="fas fa-upload" style="color: #28a745"></i>';
			case 'MetaDL':
				return '<i class="fas fa-file" style="color: var(--secondary-text-color)"></i>';
			case 'Paused':
				return '<i class="fas fa-pause" style="color: var(--secondary-text-color)"></i>';
			case 'Queued':
				return '<i class="fas fa-clock" style="color: var(--secondary-text-color)"></i>';
			case 'Seeding':
				return '<i class="fas fa-seedling" style="color: #28a745"></i>';
			case 'Stalled':
				return '<i class="fas fa-stop" style="color: #ff9800"></i>';
			case 'Unknown':
				return '<i class="fas fa-question" style="color: var(--secondary-text-color)"></i>';
			case 'Uploading':
				return '<i class="fas fa-upload" style="color: #28a745"></i>';
			case 'Completed':
				return '<i class="fas fa-check" style="color: #28a745"></i>';
			case 'Running':
				return '<i class="fas fa-play" style="color: var(--accent-color)"></i>';
			case 'Stopped':
				return '<i class="fas fa-stop" style="color: var(--secondary-text-color)"></i>';
			case 'Active':
				return '<i class="fas fa-bolt" style="color: #ff9800"></i>';
			case 'Inactive':
				return '<i class="fas fa-circle" style="color: var(--secondary-text-color)"></i>';
			case 'Stalled uploading':
				return '<i class="fas fa-upload" style="color: #ff9800"></i>';
			case 'Stalled downloading':
				return '<i class="fas fa-download" style="color: #ff9800"></i>';
			case 'Moving':
				return '<i class="fas fa-arrows-alt" style="color: #6f42c1"></i>';
			default:
				return '<i class="fas fa-folder" style="color: var(--secondary-text-color)"></i>';
		}
	}

	// --- COMPTAGES POUR LES FILTRES ---
	$: statusOptions = [
		{ value: '', label: 'Tous', count: torrents.length },
		...visibleStatuses.map((status) => ({
			value: status,
			label: status,
			count: torrents.filter((t) => t.status === status).length
		}))
	];

	$: instanceOptions = [
		{ value: '', label: 'Toutes', count: torrents.length },
		{
			value: 'Seedbox-FR',
			label: 'Seedbox-FR',
			count: torrents.filter((t) => t.instance === 'Seedbox-FR').length
		},
		{
			value: 'Serveur-US',
			label: 'Serveur-US',
			count: torrents.filter((t) => t.instance === 'Serveur-US').length
		}
	];

	$: allCategories = [...new Set(torrents.map((t) => t.category))];
	$: categoryOptions = [
		{ value: '', label: 'Toutes', count: torrents.length },
		...allCategories.map((cat) => ({
			value: cat,
			label: cat,
			count: torrents.filter((t) => t.category === cat).length
		}))
	];

	$: allTags = [...new Set(torrents.flatMap((t) => t.tags))];
	$: tagOptions = [
		{ value: '', label: 'Tous', count: torrents.length },
		...allTags.map((tag) => ({
			value: tag,
			label: tag,
			count: torrents.filter((t) => t.tags.includes(tag)).length
		}))
	];

	// --- LOGIQUE DE FILTRAGE ---
	$: filteredTorrents = torrents.filter((torrent) => {
		if (searchFilter && !torrent.name.toLowerCase().includes(searchFilter.toLowerCase()))
			return false;
		if (statusFilter && torrent.status !== statusFilter) return false;
		if (instanceFilter && torrent.instance !== instanceFilter) return false;
		if (categoryFilter && torrent.category !== categoryFilter) return false;
		if (tagFilter && !torrent.tags.includes(tagFilter)) return false;
		return true;
	});

	const torrents = [
		{
			id: 1,
			name: 'Ubuntu.24.04.LTS.iso',
			instance: 'Seedbox-FR',
			category: 'OS',
			tags: ['linux', 'iso'],
			size: '4.6 GB',
			progress: 100,
			status: 'Seeding',
			dl_speed: '0 B/s',
			ul_speed: '12.3 MB/s'
		},
		{
			id: 2,
			name: 'ArchLinux.Latest.iso',
			instance: 'Serveur-US',
			category: 'OS',
			tags: ['linux', 'iso'],
			size: '870 MB',
			progress: 76,
			status: 'Downloading',
			dl_speed: '15.4 MB/s',
			ul_speed: '1.2 MB/s'
		},
		{
			id: 3,
			name: 'My.Awesome.Movie.2025.2160p.mkv',
			instance: 'Serveur-US',
			category: 'Media',
			tags: ['movie', '2160p'],
			size: '22.1 GB',
			progress: 23,
			status: 'Downloading',
			dl_speed: '16.9 MB/s',
			ul_speed: '540 KB/s'
		},
		{
			id: 4,
			name: 'Old.Backup.File.zip',
			instance: 'Seedbox-FR',
			category: 'Backup',
			tags: ['zip'],
			size: '1.2 GB',
			progress: 0,
			status: 'Paused',
			dl_speed: '0 B/s',
			ul_speed: '0 B/s'
		},
		{
			id: 5,
			name: 'Fedora.40.Workstation.iso',
			instance: 'Seedbox-FR',
			category: 'OS',
			tags: ['linux', 'iso'],
			size: '5.2 GB',
			progress: 85,
			status: 'Downloading',
			dl_speed: '8.7 MB/s',
			ul_speed: '2.1 MB/s'
		},
		{
			id: 6,
			name: 'Debian.12.Netinst.iso',
			instance: 'Serveur-US',
			category: 'OS',
			tags: ['linux', 'iso'],
			size: '650 MB',
			progress: 100,
			status: 'Seeding',
			dl_speed: '0 B/s',
			ul_speed: '5.6 MB/s'
		},
		{
			id: 7,
			name: 'The.Matrix.Resurrections.2021.1080p.mkv',
			instance: 'Serveur-US',
			category: 'Media',
			tags: ['movie', '1080p'],
			size: '8.5 GB',
			progress: 67,
			status: 'Downloading',
			dl_speed: '22.3 MB/s',
			ul_speed: '1.8 MB/s'
		},
		{
			id: 8,
			name: 'Project.Backup.2024.tar.gz',
			instance: 'Seedbox-FR',
			category: 'Backup',
			tags: ['tar', 'gz'],
			size: '3.8 GB',
			progress: 45,
			status: 'Downloading',
			dl_speed: '9.2 MB/s',
			ul_speed: '0 B/s'
		},
		{
			id: 9,
			name: 'Windows.11.Pro.iso',
			instance: 'Serveur-US',
			category: 'OS',
			tags: ['windows', 'iso'],
			size: '6.1 GB',
			progress: 100,
			status: 'Seeding',
			dl_speed: '0 B/s',
			ul_speed: '18.9 MB/s'
		},
		{
			id: 10,
			name: 'Documentary.Nature.2025.720p.mp4',
			instance: 'Seedbox-FR',
			category: 'Media',
			tags: ['documentary', '720p'],
			size: '2.3 GB',
			progress: 92,
			status: 'Seeding',
			dl_speed: '0 B/s',
			ul_speed: '7.4 MB/s'
		},
		{
			id: 11,
			name: 'Database.Backup.sql.gz',
			instance: 'Serveur-US',
			category: 'Backup',
			tags: ['sql', 'gz'],
			size: '1.9 GB',
			progress: 0,
			status: 'Paused',
			dl_speed: '0 B/s',
			ul_speed: '0 B/s'
		},
		{
			id: 12,
			name: 'Manjaro.KDE.23.iso',
			instance: 'Seedbox-FR',
			category: 'OS',
			tags: ['linux', 'iso'],
			size: '4.0 GB',
			progress: 34,
			status: 'Downloading',
			dl_speed: '12.1 MB/s',
			ul_speed: '3.2 MB/s'
		},
		{
			id: 13,
			name: 'CentOS.9.Stream.iso',
			instance: 'Serveur-US',
			category: 'OS',
			tags: ['linux', 'iso'],
			size: '7.2 GB',
			progress: 100,
			status: 'Seeding',
			dl_speed: '0 B/s',
			ul_speed: '9.8 MB/s'
		},
		{
			id: 14,
			name: 'Kali.Linux.2024.iso',
			instance: 'Seedbox-FR',
			category: 'OS',
			tags: ['linux', 'iso'],
			size: '3.9 GB',
			progress: 50,
			status: 'Downloading',
			dl_speed: '14.5 MB/s',
			ul_speed: '2.3 MB/s'
		},
		{
			id: 15,
			name: 'Gentoo.LiveCD.iso',
			instance: 'Serveur-US',
			category: 'OS',
			tags: ['linux', 'iso'],
			size: '1.8 GB',
			progress: 100,
			status: 'Seeding',
			dl_speed: '0 B/s',
			ul_speed: '6.7 MB/s'
		},
		{
			id: 16,
			name: 'Slackware.15.0.iso',
			instance: 'Seedbox-FR',
			category: 'OS',
			tags: ['linux', 'iso'],
			size: '4.7 GB',
			progress: 20,
			status: 'Downloading',
			dl_speed: '18.2 MB/s',
			ul_speed: '1.5 MB/s'
		},
		{
			id: 17,
			name: 'OpenSUSE.Leap.15.5.iso',
			instance: 'Serveur-US',
			category: 'OS',
			tags: ['linux', 'iso'],
			size: '5.1 GB',
			progress: 100,
			status: 'Seeding',
			dl_speed: '0 B/s',
			ul_speed: '11.4 MB/s'
		},
		{
			id: 18,
			name: 'Elementary.OS.7.iso',
			instance: 'Seedbox-FR',
			category: 'OS',
			tags: ['linux', 'iso'],
			size: '2.6 GB',
			progress: 75,
			status: 'Downloading',
			dl_speed: '9.8 MB/s',
			ul_speed: '3.1 MB/s'
		},
		{
			id: 19,
			name: 'Linux.Mint.21.2.iso',
			instance: 'Serveur-US',
			category: 'OS',
			tags: ['linux', 'iso'],
			size: '2.9 GB',
			progress: 100,
			status: 'Seeding',
			dl_speed: '0 B/s',
			ul_speed: '8.9 MB/s'
		},
		{
			id: 20,
			name: 'Zorin.OS.16.iso',
			instance: 'Seedbox-FR',
			category: 'OS',
			tags: ['linux', 'iso'],
			size: '4.1 GB',
			progress: 40,
			status: 'Downloading',
			dl_speed: '13.7 MB/s',
			ul_speed: '2.8 MB/s'
		},
		{
			id: 21,
			name: 'MX.Linux.23.iso',
			instance: 'Serveur-US',
			category: 'OS',
			tags: ['linux', 'iso'],
			size: '2.4 GB',
			progress: 100,
			status: 'Seeding',
			dl_speed: '0 B/s',
			ul_speed: '7.2 MB/s'
		},
		{
			id: 22,
			name: 'Pop.OS.22.04.iso',
			instance: 'Seedbox-FR',
			category: 'OS',
			tags: ['linux', 'iso'],
			size: '5.8 GB',
			progress: 60,
			status: 'Downloading',
			dl_speed: '17.3 MB/s',
			ul_speed: '1.9 MB/s'
		},
		{
			id: 23,
			name: 'Solus.Budgie.iso',
			instance: 'Serveur-US',
			category: 'OS',
			tags: ['linux', 'iso'],
			size: '2.1 GB',
			progress: 100,
			status: 'Seeding',
			dl_speed: '0 B/s',
			ul_speed: '5.5 MB/s'
		},
		{
			id: 24,
			name: 'EndeavourOS.Artemis.iso',
			instance: 'Seedbox-FR',
			category: 'OS',
			tags: ['linux', 'iso'],
			size: '2.7 GB',
			progress: 30,
			status: 'Downloading',
			dl_speed: '11.6 MB/s',
			ul_speed: '2.4 MB/s'
		},
		{
			id: 25,
			name: 'Garuda.Linux.KDE.iso',
			instance: 'Serveur-US',
			category: 'OS',
			tags: ['linux', 'iso'],
			size: '3.3 GB',
			progress: 100,
			status: 'Seeding',
			dl_speed: '0 B/s',
			ul_speed: '10.1 MB/s'
		},
		{
			id: 26,
			name: 'Nobara.38.iso',
			instance: 'Seedbox-FR',
			category: 'OS',
			tags: ['linux', 'iso'],
			size: '4.5 GB',
			progress: 55,
			status: 'Downloading',
			dl_speed: '16.8 MB/s',
			ul_speed: '3.7 MB/s'
		},
		{
			id: 27,
			name: 'Fedora.Silverblue.38.iso',
			instance: 'Serveur-US',
			category: 'OS',
			tags: ['linux', 'iso'],
			size: '5.9 GB',
			progress: 100,
			status: 'Seeding',
			dl_speed: '0 B/s',
			ul_speed: '14.2 MB/s'
		},
		{
			id: 28,
			name: 'Ubuntu.Server.24.04.iso',
			instance: 'Seedbox-FR',
			category: 'OS',
			tags: ['linux', 'iso'],
			size: '1.4 GB',
			progress: 80,
			status: 'Downloading',
			dl_speed: '7.9 MB/s',
			ul_speed: '1.1 MB/s'
		},
		{
			id: 29,
			name: 'Debian.Live.12.iso',
			instance: 'Serveur-US',
			category: 'OS',
			tags: ['linux', 'iso'],
			size: '3.2 GB',
			progress: 100,
			status: 'Seeding',
			dl_speed: '0 B/s',
			ul_speed: '9.3 MB/s'
		},
		{
			id: 30,
			name: 'Arch.Linux.Install.iso',
			instance: 'Seedbox-FR',
			category: 'OS',
			tags: ['linux', 'iso'],
			size: '850 MB',
			progress: 25,
			status: 'Downloading',
			dl_speed: '4.6 MB/s',
			ul_speed: '0.8 MB/s'
		},
		{
			id: 31,
			name: 'The.Dark.Knight.2008.1080p.mkv',
			instance: 'Serveur-US',
			category: 'Media',
			tags: ['movie', '1080p'],
			size: '12.5 GB',
			progress: 100,
			status: 'Seeding',
			dl_speed: '0 B/s',
			ul_speed: '25.7 MB/s'
		},
		{
			id: 32,
			name: 'Inception.2010.2160p.mkv',
			instance: 'Seedbox-FR',
			category: 'Media',
			tags: ['movie', '2160p'],
			size: '28.9 GB',
			progress: 45,
			status: 'Downloading',
			dl_speed: '31.2 MB/s',
			ul_speed: '5.4 MB/s'
		},
		{
			id: 33,
			name: 'Pulp.Fiction.1994.720p.mkv',
			instance: 'Serveur-US',
			category: 'Media',
			tags: ['movie', '720p'],
			size: '4.8 GB',
			progress: 100,
			status: 'Seeding',
			dl_speed: '0 B/s',
			ul_speed: '12.8 MB/s'
		},
		{
			id: 34,
			name: 'Interstellar.2014.1080p.mkv',
			instance: 'Seedbox-FR',
			category: 'Media',
			tags: ['movie', '1080p'],
			size: '15.2 GB',
			progress: 70,
			status: 'Downloading',
			dl_speed: '28.9 MB/s',
			ul_speed: '4.1 MB/s'
		},
		{
			id: 35,
			name: 'The.Shawshank.Redemption.1994.720p.mkv',
			instance: 'Serveur-US',
			category: 'Media',
			tags: ['movie', '720p'],
			size: '1.6 GB',
			progress: 100,
			status: 'Seeding',
			dl_speed: '0 B/s',
			ul_speed: '8.5 MB/s'
		},
		{
			id: 36,
			name: 'Dune.2021.2160p.mkv',
			instance: 'Seedbox-FR',
			category: 'Media',
			tags: ['movie', '2160p'],
			size: '35.7 GB',
			progress: 35,
			status: 'Downloading',
			dl_speed: '42.3 MB/s',
			ul_speed: '6.8 MB/s'
		},
		{
			id: 37,
			name: 'Forrest.Gump.1994.1080p.mkv',
			instance: 'Serveur-US',
			category: 'Media',
			tags: ['movie', '1080p'],
			size: '9.3 GB',
			progress: 100,
			status: 'Seeding',
			dl_speed: '0 B/s',
			ul_speed: '19.6 MB/s'
		},
		{
			id: 38,
			name: 'The.Godfather.1972.720p.mkv',
			instance: 'Seedbox-FR',
			category: 'Media',
			tags: ['movie', '720p'],
			size: '2.9 GB',
			progress: 85,
			status: 'Downloading',
			dl_speed: '12.7 MB/s',
			ul_speed: '2.9 MB/s'
		},
		{
			id: 39,
			name: 'Avatar.2009.2160p.mkv',
			instance: 'Serveur-US',
			category: 'Media',
			tags: ['movie', '2160p'],
			size: '41.2 GB',
			progress: 100,
			status: 'Seeding',
			dl_speed: '0 B/s',
			ul_speed: '33.1 MB/s'
		},
		{
			id: 40,
			name: 'Fight.Club.1999.1080p.mkv',
			instance: 'Seedbox-FR',
			category: 'Media',
			tags: ['movie', '1080p'],
			size: '11.8 GB',
			progress: 50,
			status: 'Downloading',
			dl_speed: '25.4 MB/s',
			ul_speed: '3.7 MB/s'
		},
		{
			id: 41,
			name: 'The.Lion.King.2019.720p.mkv',
			instance: 'Serveur-US',
			category: 'Media',
			tags: ['movie', '720p'],
			size: '3.2 GB',
			progress: 100,
			status: 'Seeding',
			dl_speed: '0 B/s',
			ul_speed: '11.5 MB/s'
		},
		{
			id: 42,
			name: 'Top.Gun.Maverick.2022.2160p.mkv',
			instance: 'Seedbox-FR',
			category: 'Media',
			tags: ['movie', '2160p'],
			size: '26.8 GB',
			progress: 65,
			status: 'Downloading',
			dl_speed: '38.9 MB/s',
			ul_speed: '7.2 MB/s'
		},
		{
			id: 43,
			name: 'The.Avengers.2012.1080p.mkv',
			instance: 'Serveur-US',
			category: 'Media',
			tags: ['movie', '1080p'],
			size: '14.7 GB',
			progress: 100,
			status: 'Seeding',
			dl_speed: '0 B/s',
			ul_speed: '29.4 MB/s'
		},
		{
			id: 44,
			name: 'Jurassic.Park.1993.720p.mkv',
			instance: 'Seedbox-FR',
			category: 'Media',
			tags: ['movie', '720p'],
			size: '2.1 GB',
			progress: 90,
			status: 'Downloading',
			dl_speed: '9.8 MB/s',
			ul_speed: '1.6 MB/s'
		},
		{
			id: 45,
			name: 'Guardians.of.the.Galaxy.2014.2160p.mkv',
			instance: 'Serveur-US',
			category: 'Media',
			tags: ['movie', '2160p'],
			size: '32.4 GB',
			progress: 100,
			status: 'Seeding',
			dl_speed: '0 B/s',
			ul_speed: '27.8 MB/s'
		},
		{
			id: 46,
			name: 'The.Silence.of.the.Lambs.1991.1080p.mkv',
			instance: 'Seedbox-FR',
			category: 'Media',
			tags: ['movie', '1080p'],
			size: '8.9 GB',
			progress: 75,
			status: 'Downloading',
			dl_speed: '21.3 MB/s',
			ul_speed: '4.5 MB/s'
		},
		{
			id: 47,
			name: 'Back.to.the.Future.1985.720p.mkv',
			instance: 'Serveur-US',
			category: 'Media',
			tags: ['movie', '720p'],
			size: '1.8 GB',
			progress: 100,
			status: 'Seeding',
			dl_speed: '0 B/s',
			ul_speed: '6.9 MB/s'
		},
		{
			id: 48,
			name: 'Spider.Man.No.Way.Home.2021.2160p.mkv',
			instance: 'Seedbox-FR',
			category: 'Media',
			tags: ['movie', '2160p'],
			size: '29.6 GB',
			progress: 40,
			status: 'Downloading',
			dl_speed: '35.7 MB/s',
			ul_speed: '5.9 MB/s'
		},
		{
			id: 49,
			name: 'The.Good.the.Bad.and.the.Ugly.1966.1080p.mkv',
			instance: 'Serveur-US',
			category: 'Media',
			tags: ['movie', '1080p'],
			size: '7.2 GB',
			progress: 100,
			status: 'Seeding',
			dl_speed: '0 B/s',
			ul_speed: '15.3 MB/s'
		},
		{
			id: 50,
			name: 'Star.Wars.Episode.IV.1977.720p.mkv',
			instance: 'Seedbox-FR',
			category: 'Media',
			tags: ['movie', '720p'],
			size: '2.5 GB',
			progress: 55,
			status: 'Downloading',
			dl_speed: '14.2 MB/s',
			ul_speed: '2.1 MB/s'
		}
	];
</script>

<div class="info-bar">
	<div class="instance-summary">
		{#each instances as instance}
			<div class="instance-stat-card">
				<div class="instance-name">
					<span class="status-dot {instance.status}"></span>
					{instance.name}
				</div>
				<div class="instance-speeds">
					<span>↓ {instance.dl}</span>
					<span>↑ {instance.ul}</span>
				</div>
			</div>
		{/each}
	</div>

	<div class="global-stats-summary">
		<div class="cumulative-stats">
			<div class="stat-item">
				<span class="stat-label">Total DL</span>
				<span class="stat-value">{globalStats.totalDownloaded}</span>
			</div>
			<div class="stat-item">
				<span class="stat-label">Total UL</span>
				<span class="stat-value">{globalStats.totalUploaded}</span>
			</div>
			<div class="stat-item">
				<span class="stat-label">Ratio</span>
				<span class="stat-value">{globalStats.ratio}</span>
			</div>
		</div>
		<div class="current-stats">
			<div class="stat-item">
				<span class="stat-label">Current DL</span>
				<span class="stat-value">{globalStats.downloadSpeed}</span>
			</div>
			<div class="stat-item">
				<span class="stat-label">Current UL</span>
				<span class="stat-value">{globalStats.uploadSpeed}</span>
			</div>
			<div class="stat-item">
				<span class="stat-label">Active</span>
				<span class="stat-value">{globalStats.activeTorrents}</span>
			</div>
		</div>
	</div>
</div>

<div class="toolbar">
	<div class="actions">
		<button class="action-btn" disabled>+ Add Torrent</button>
		<button class="action-btn" disabled>Pause All</button>
		<button class="action-btn" disabled>Resume All</button>
	</div>
	<div class="status-filter-group" style="position: relative;">
		<div class="status-filters">
			{#each statusOptions as option}
				<button
					class="status-btn {statusFilter === option.value ? 'active' : ''}"
					on:click={() => (statusFilter = statusFilter === option.value ? '' : option.value)}
				>
					{@html getStatusIcon(option.value)}
					<span class="label">{option.label}</span>
					<span class="count">({option.count})</span>
				</button>
			{/each}
			<button class="settings-btn" on:click={() => (showStatusSettings = !showStatusSettings)}>
				<i class="fas fa-cog"></i>
			</button>
		</div>
		{#if showStatusSettings}
			<div class="status-settings-overlay" on:click={() => (showStatusSettings = false)}>
				<div class="status-settings" on:click|stopPropagation>
					<form method="POST" action="?/updateSettings" use:enhance bind:this={settingsForm}>
						<input type="hidden" name="visibleStatuses" value={JSON.stringify(selectedStatuses)} />
						{#each allStatuses as status}
							<label>
								<input
									type="checkbox"
									bind:group={selectedStatuses}
									value={status}
									on:change={() => settingsForm?.requestSubmit()}
								/>
								{status}
							</label>
						{/each}
					</form>
				</div>
			</div>
		{/if}
	</div>
	<div class="filters">
		<div class="filter-row">
			<label for="search">Recherche:</label>
			<input id="search" type="search" placeholder="Filter by name..." bind:value={searchFilter} />
		</div>
		<div class="filter-row">
			<div class="custom-select">
				<label>Catégorie:</label>
				<button on:click={() => (categoryDropdownOpen = !categoryDropdownOpen)}>
					{categoryOptions.find((o) => o.value === categoryFilter)?.label || 'Toutes'} ({categoryOptions.find(
						(o) => o.value === categoryFilter
					)?.count || torrents.length})
					<svg
						class="arrow"
						class:open={categoryDropdownOpen}
						width="12"
						height="12"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"><polyline points="6,9 12,15 18,9"></polyline></svg
					>
				</button>
				{#if categoryDropdownOpen}
					<div class="dropdown">
						{#each categoryOptions as option}
							<div
								class="option"
								on:click={() => {
									categoryFilter = option.value;
									categoryDropdownOpen = false;
								}}
							>
								{option.label} ({option.count})
							</div>
						{/each}
					</div>
				{/if}
			</div>
			<div class="custom-select">
				<label>Instance:</label>
				<button on:click={() => (instanceDropdownOpen = !instanceDropdownOpen)}>
					{instanceOptions.find((o) => o.value === instanceFilter)?.label || 'Toutes'} ({instanceOptions.find(
						(o) => o.value === instanceFilter
					)?.count || torrents.length})
					<svg
						class="arrow"
						class:open={instanceDropdownOpen}
						width="12"
						height="12"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"><polyline points="6,9 12,15 18,9"></polyline></svg
					>
				</button>
				{#if instanceDropdownOpen}
					<div class="dropdown">
						{#each instanceOptions as option}
							<div
								class="option"
								on:click={() => {
									instanceFilter = option.value;
									instanceDropdownOpen = false;
								}}
							>
								{option.label} ({option.count})
							</div>
						{/each}
					</div>
				{/if}
			</div>
			<div class="custom-select">
				<label>Tag:</label>
				<button on:click={() => (tagDropdownOpen = !tagDropdownOpen)}>
					{tagOptions.find((o) => o.value === tagFilter)?.label || 'Tous'} ({tagOptions.find(
						(o) => o.value === tagFilter
					)?.count || torrents.length})
					<svg
						class="arrow"
						class:open={tagDropdownOpen}
						width="12"
						height="12"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"><polyline points="6,9 12,15 18,9"></polyline></svg
					>
				</button>
				{#if tagDropdownOpen}
					<div class="dropdown">
						{#each tagOptions as option}
							<div
								class="option"
								on:click={() => {
									tagFilter = option.value;
									tagDropdownOpen = false;
								}}
							>
								{option.label} ({option.count})
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	</div>
</div>

<div class="content-area">
	<div class="table-container">
		<div class="card-header">
			<div class="metric-label">All Torrents</div>
			<button class="icon-btn" title="Customize columns" disabled>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					><path
						d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 0 2l-.15.08a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1 0-2l.15-.08a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
					/><circle cx="12" cy="12" r="3" /></svg
				>
			</button>
		</div>
		<div class="torrent-table">
			<table>
				<thead>
					<tr>
						<th
							style="width: {columnWidths[0]}; position: relative; cursor: pointer;"
							on:click={() => toggleSort('name')}
						>
							Name <span class="sort-indicator"
								>{sortKey === 'name' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}</span
							>
							<div class="resize-handle" on:mousedown={(e) => startResize(e, 0)}></div>
						</th>
						<th
							style="width: {columnWidths[1]}; position: relative; cursor: pointer;"
							on:click={() => toggleSort('instance')}
						>
							Instance <span class="sort-indicator"
								>{sortKey === 'instance' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}</span
							>
							<div class="resize-handle" on:mousedown={(e) => startResize(e, 1)}></div>
						</th>
						<th
							style="width: {columnWidths[2]}; position: relative; cursor: pointer;"
							on:click={() => toggleSort('size')}
						>
							Size <span class="sort-indicator"
								>{sortKey === 'size' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}</span
							>
							<div class="resize-handle" on:mousedown={(e) => startResize(e, 2)}></div>
						</th>
						<th
							style="width: {columnWidths[3]}; position: relative; cursor: pointer;"
							on:click={() => toggleSort('progress')}
						>
							Progress <span class="sort-indicator"
								>{sortKey === 'progress' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}</span
							>
							<div class="resize-handle" on:mousedown={(e) => startResize(e, 3)}></div>
						</th>
						<th
							style="width: {columnWidths[4]}; position: relative; cursor: pointer;"
							on:click={() => toggleSort('status')}
						>
							Status <span class="sort-indicator"
								>{sortKey === 'status' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}</span
							>
							<div class="resize-handle" on:mousedown={(e) => startResize(e, 4)}></div>
						</th>
						<th
							class="right"
							style="width: {columnWidths[5]}; position: relative; cursor: pointer;"
							on:click={() => toggleSort('dl_speed')}
						>
							DL Speed <span class="sort-indicator"
								>{sortKey === 'dl_speed' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}</span
							>
							<div class="resize-handle" on:mousedown={(e) => startResize(e, 5)}></div>
						</th>
						<th
							class="right"
							style="width: {columnWidths[6]}; position: relative; cursor: pointer;"
							on:click={() => toggleSort('ul_speed')}
						>
							UL Speed <span class="sort-indicator"
								>{sortKey === 'ul_speed' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}</span
							>
						</th>
					</tr>
				</thead>
				<tbody>
					{#each sortedTorrents as torrent (torrent.id)}
						<tr
							on:click={() => (selectedTorrent = torrent)}
							class:selected={selectedTorrent?.id === torrent.id}
						>
							<td class="name">{torrent.name}</td>
							<td>{torrent.instance}</td>
							<td>{torrent.size}</td>
							<td class="progress-cell">
								<div class="progress-bar-container">
									<div class="progress-bar" style="width: {torrent.progress}%"></div>
								</div>
							</td>
							<td
								><span class="status-indicator status-{torrent.status.toLowerCase()}"
									>{torrent.status}</span
								></td
							>
							<td class="right mono">{torrent.dl_speed}</td>
							<td class="right mono">{torrent.ul_speed}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>

	{#if selectedTorrent}
		<div class="info-panel">
			<div class="panel-header">
				<h3>{selectedTorrent.name}</h3>
				<button class="close-btn" on:click={() => (selectedTorrent = null)}>×</button>
			</div>
			<div class="panel-content">
				<div class="tabs">
					<button class="tab active">General</button>
					<button class="tab" disabled>Trackers</button>
					<button class="tab" disabled>Peers</button>
					<button class="tab" disabled>Files</button>
				</div>
				<div class="tab-content">
					<p><strong>Status:</strong> {selectedTorrent.status}</p>
					<p><strong>Instance:</strong> {selectedTorrent.instance}</p>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	/* --- Barre d'info supérieure --- */
	.info-bar {
		display: flex;
		justify-content: space-between;
		align-items: stretch;
		gap: 1.5rem;
		margin-bottom: 1rem;
	}
	.instance-summary,
	.global-stats-summary {
		display: flex;
		gap: 1rem;
		background-color: var(--card-background-color);
		border: 1px solid var(--border-color);
		border-radius: 5px;
		padding: 0.75rem;
	}
	.instance-stat-card {
		padding-right: 1rem;
		border-right: 1px solid var(--border-color);
	}
	.instance-stat-card:last-child {
		border-right: none;
		padding-right: 0;
	}
	.instance-name {
		font-size: 0.9rem;
		font-weight: 700;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.status-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
	}
	.status-dot.online {
		background-color: #28a745;
	}
	.status-dot.offline {
		background-color: var(--secondary-text-color);
	}
	.instance-speeds {
		font-family: var(--font-family-mono);
		font-size: 0.8rem;
		color: var(--secondary-text-color);
		display: flex;
		gap: 0.75rem;
		margin-top: 0rem;
	}
	.global-stats-summary {
		flex-direction: column;
		gap: 0.25rem;
		width: fit-content;
	}
	.cumulative-stats,
	.current-stats {
		display: grid;
		grid-template-columns: 2fr 2fr 1fr;
		gap: 0.5rem;
	}
	.stat-item {
		text-align: left;
		padding: 0 1rem;
	}
	.stat-label {
		font-size: 0.7rem;
		text-transform: uppercase;
		color: var(--secondary-text-color);
		font-weight: 700;
		min-width: 70px;
		text-align: right;
	}
	.stat-value {
		font-family: var(--font-family-mono);
		font-size: 1rem;
		font-weight: 700;
	}

	/* --- Barre d'outils --- */
	.toolbar {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		padding: 0.75rem;
		background-color: var(--card-background-color);
		border: 1px solid var(--border-color);
		border-radius: 5px;
		margin-bottom: 1.5rem;
		gap: 1rem;
	}
	.actions {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.action-btn {
		background-color: transparent;
		border: 1px solid var(--border-color);
		padding: 0.5rem 1rem;
		border-radius: 4px;
		font-weight: 700;
		cursor: pointer;
	}
	.action-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.status-filters {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
		gap: 0.25rem;
		max-width: 550px;
	}
	.status-btn {
		background: transparent;
		border: 1px solid var(--border-color);
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		font-size: 0.75rem;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 0.25rem;
		justify-content: space-between;
	}
	.label {
		flex: 1;
		text-align: center;
	}
	.count {
		flex-shrink: 0;
	}
	.status-btn.active {
		background: transparent;
		color: var(--accent-color);
		border: 2px solid var(--accent-color);
		font-weight: bold;
	}
	.status-btn:hover {
		background: var(--background-color);
	}
	.settings-btn {
		background: transparent;
		border: 1px solid var(--border-color);
		padding: 0.25rem;
		border-radius: 4px;
		cursor: pointer;
		font-size: 0.75rem;
	}
	.settings-btn:hover {
		background: var(--background-color);
	}
	.status-settings-overlay {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 5;
	}
	.status-settings {
		position: absolute;
		top: 100%;
		left: 0;
		background: var(--card-background-color);
		border: 1px solid var(--border-color);
		border-radius: 4px;
		padding: 0.5rem;
		z-index: 10;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		max-height: 200px;
		overflow-y: auto;
		box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
	}
	.status-settings label {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.8rem;
		cursor: pointer;
	}
	.filters {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.filter-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.filter-row label {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--secondary-text-color);
		min-width: 80px;
	}
	.filter-row input[type='search'],
	.filter-row select {
		padding: 0.5rem;
		border: 1px solid var(--border-color);
		border-radius: 4px;
		font-size: 0.9rem;
	}
	.filter-row input[type='search'] {
		min-width: 250px;
		flex: 1;
	}
	.filter-row select {
		min-width: 120px;
	}
	.custom-select {
		position: relative;
		display: flex;
		flex-direction: column;
		min-width: 120px;
	}
	.custom-select label {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--secondary-text-color);
		margin-bottom: 0.25rem;
	}
	.custom-select button {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem;
		border: 1px solid var(--border-color);
		border-radius: 4px;
		background: var(--card-background-color);
		cursor: pointer;
		font-size: 0.9rem;
	}
	.custom-select button:hover {
		background: var(--background-color);
	}
	.arrow {
		transition: transform 0.2s;
	}
	.arrow.open {
		transform: rotate(180deg);
	}
	.dropdown {
		position: absolute;
		top: 100%;
		left: 0;
		right: 0;
		background: var(--card-background-color);
		border: 1px solid var(--border-color);
		border-radius: 4px;
		z-index: 10;
		max-height: 200px;
		overflow-y: auto;
	}
	.option {
		padding: 0.5rem;
		cursor: pointer;
		font-size: 0.9rem;
	}
	.option:hover {
		background: var(--background-color);
	}

	/* --- Contenu principal --- */
	.content-area {
		position: relative;
	}
	.table-container {
		background-color: var(--card-background-color);
		border: 1px solid var(--border-color);
		border-radius: 5px;
		padding: 0;
	}
	.card-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid var(--border-color);
	}
	.metric-label {
		font-size: 0.9rem;
		color: var(--secondary-text-color);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.icon-btn {
		background: transparent;
		border: none;
		padding: 0.25rem;
		cursor: pointer;
		color: var(--secondary-text-color);
	}
	.icon-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.icon-btn:hover:not(:disabled) {
		color: var(--primary-text-color);
	}

	.torrent-table {
		width: 100%;
		overflow-x: auto;
	}
	table {
		width: 100%;
		border-collapse: collapse;
	}
	th,
	td {
		padding: 0.75rem 1rem;
		text-align: left;
		border-bottom: 1px solid var(--border-color);
		border-right: 1px solid var(--border-color);
		white-space: nowrap;
		font-size: 0.9rem;
	}
	th:last-child,
	td:last-child {
		border-right: none;
	}
	tbody tr {
		cursor: pointer;
		transition: background-color 0.15s ease;
	}
	tbody tr:hover {
		background-color: var(--background-color);
	}
	tbody tr.selected {
		background-color: rgba(0, 123, 255, 0.1);
	}

	/* --- Poignées de redimensionnement --- */
	.resize-handle {
		position: absolute;
		right: 0;
		top: 0;
		bottom: 0;
		width: 8px;
		cursor: col-resize;
		background-color: transparent;
		opacity: 0;
		transition: opacity 0.2s;
	}
	th:hover .resize-handle {
		opacity: 1;
	}
	.resize-handle:hover {
		background-color: var(--accent-color);
		opacity: 0.5;
	}

	/* Styles spécifiques aux cellules du tableau */
	.name {
		max-width: 350px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.right {
		text-align: right;
	}
	.mono {
		font-family: var(--font-family-mono);
	}
	.progress-cell {
		min-width: 120px;
	}
	.progress-bar-container {
		height: 6px;
		background-color: var(--background-color);
		border-radius: 3px;
		overflow: hidden;
	}
	.progress-bar {
		height: 100%;
		background-color: var(--accent-color);
		border-radius: 3px;
	}
	.status-indicator {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 0.85rem;
	}
	.status-indicator::before {
		content: '';
		display: inline-block;
		width: 7px;
		height: 7px;
		border-radius: 50%;
	}
	.status-seeding::before {
		background-color: #28a745;
	}
	.status-downloading::before {
		background-color: var(--accent-color);
	}
	.status-paused::before {
		background-color: var(--secondary-text-color);
	}
	.status-error::before {
		background-color: #dc3545;
	}

	/* --- Panneau d'informations --- */
	.info-panel {
		background-color: var(--card-background-color);
		border-top: 2px solid var(--border-color);
		height: 250px;
		display: flex;
		flex-direction: column;
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		z-index: 10;
	}
	.panel-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.5rem 1rem;
		border-bottom: 1px solid var(--border-color);
		font-weight: 700;
	}
	.close-btn {
		background: none;
		border: none;
		font-size: 1.5rem;
		cursor: pointer;
	}
	.panel-content {
		padding: 1rem;
		flex-grow: 1;
		overflow-y: auto;
	}
	.tabs {
		display: flex;
		gap: 0.25rem;
		border-bottom: 1px solid var(--border-color);
		margin-bottom: 1rem;
	}
	.tab {
		background: none;
		border: none;
		padding: 0.5rem 1rem;
		cursor: pointer;
		border-bottom: 2px solid transparent;
	}
	.tab.active {
		border-bottom-color: var(--accent-color);
		font-weight: 700;
	}

	/* Dark mode styles */
	:global(html.dark-mode .info-bar .instance-summary),
	:global(html.dark-mode .info-bar .global-stats-summary),
	:global(html.dark-mode .toolbar),
	:global(html.dark-mode .status-settings),
	:global(html.dark-mode .dropdown),
	:global(html.dark-mode .table-container),
	:global(html.dark-mode .info-panel) {
		background-color: var(--card-background-color);
		border-color: var(--border-color);
	}

	:global(html.dark-mode .custom-select button),
	:global(html.dark-mode .status-btn),
	:global(html.dark-mode .settings-btn),
	:global(html.dark-mode .action-btn) {
		background-color: var(--card-background-color);
		border-color: var(--border-color);
		color: var(--primary-text-color);
	}

	:global(html.dark-mode .custom-select button:hover),
	:global(html.dark-mode .status-btn:hover),
	:global(html.dark-mode .settings-btn:hover),
	:global(html.dark-mode .action-btn:not(:disabled):hover) {
		background-color: var(--background-color);
	}

	:global(html.dark-mode .option:hover),
	:global(html.dark-mode tbody tr:hover) {
		background-color: var(--background-color);
	}

	:global(html.dark-mode tbody tr.selected) {
		background-color: rgba(0, 153, 255, 0.1);
	}

	:global(html.dark-mode .resize-handle:hover) {
		background-color: var(--accent-color);
	}

	:global(html.dark-mode .status-settings label) {
		color: var(--primary-text-color);
	}

	:global(html.dark-mode .status-indicator) {
		color: var(--primary-text-color);
	}

	:global(html.dark-mode .status-btn .label),
	:global(html.dark-mode .status-btn .count) {
		color: var(--primary-text-color);
	}

	:global(html.dark-mode .filter-row label),
	:global(html.dark-mode .custom-select label) {
		color: var(--secondary-text-color);
	}
</style>
