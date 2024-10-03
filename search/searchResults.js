$(document).ready(function() {
    const API_BASE_URL = 'https://api.themoviedb.org/3';
    let apiKey;
    let genreMap = {}; // Global genre map

    const handleError = (message, error) => {
        console.error(message, error);
    };

    const getApiKey = async () => {
        try {
            const { apiKey } = await $.getJSON('apis/config.json');
            return apiKey;
        } catch (error) {
            handleError('Failed to fetch API key.', error);
            return null;
        }
    };

    const fetchAllGenres = async () => {
        try {
            const [movieGenres, tvGenres] = await Promise.all([
                $.getJSON(`${API_BASE_URL}/genre/movie/list?api_key=${apiKey}&language=en-US`),
                $.getJSON(`${API_BASE_URL}/genre/tv/list?api_key=${apiKey}&language=en-US`)
            ]);
            return [...movieGenres.genres, ...tvGenres.genres];
        } catch (error) {
            handleError('Failed to fetch genres.', error);
            return [];
        }
    };

    const debounce = (func, delay) => {
        let timeoutId;
        return (...args) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func(...args), delay);
        };
    };

    const showLoading = () => {
        $('#searchSuggestions').html('<div class="spinner"></div>').removeClass('hidden');
    };

    const highlightText = (text, query) =>
        query ? text.replace(new RegExp(`(${query})`, 'gi'), '<span class="highlight">$1</span>') : text;

    const displaySearchSuggestions = (results, query) => {
        const $searchSuggestions = $('#searchSuggestions');
        if (results.length === 0) {
            $searchSuggestions.html('<div class="no-suggestions">No suggestions available</div>').removeClass('hidden');
            return;
        }

        const suggestionsHTML = results.map(media => {
            const mediaTypeLabel = media.media_type === 'movie' ? '🎬 Movie' : '📺 TV Show';
            const mediaTitle = media.title || media.name;
            const mediaRating = media.vote_average ? media.vote_average.toFixed(1) : 'N/A';
            const highlightedTitle = highlightText(mediaTitle, query);
            const genreNames = (media.genre_ids || []).map(id => genreMap[id] || 'Unknown').slice(0, 2).join(', ');
            const year = media.release_date ? new Date(media.release_date).getFullYear() :
                (media.first_air_date ? new Date(media.first_air_date).getFullYear() : 'N/A');

            return `
                <div class="suggestion-item" data-id="${media.id}" data-type="${media.media_type}">
                    <img src="https://image.tmdb.org/t/p/w185${media.poster_path}" alt="${mediaTitle}" class="suggestion-poster">
                    <div class="suggestion-content">
                        <h4 class="suggestion-title">${highlightedTitle}</h4>
                        <div class="suggestion-details">
                            <span class="suggestion-type">${mediaTypeLabel}</span>
                            <span class="suggestion-year">${year}</span>
                        </div>
                        <div class="suggestion-meta">
                            <span class="suggestion-rating">⭐ ${mediaRating}</span>
                            <span class="suggestion-genres">${genreNames}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        $searchSuggestions.html(suggestionsHTML).removeClass('hidden');

        $searchSuggestions.find('.suggestion-item').on('click', function() {
            const mediaId = $(this).data('id');
            const mediaType = $(this).data('type');
            fetchSelectedMedia(mediaId, mediaType);
            $searchSuggestions.addClass('hidden');
        });

        setupKeyboardNavigation($searchSuggestions);
    };

    const displaySearchResults = (results) => {
        const $mediaContainer = $('#mediaContainer');
        if (results.length === 0) {
            $mediaContainer.html('<div class="p-4 text-gray-400 text-center">No results found</div>');
            return;
        }

        const resultsHTML = results.map(media => {
            const genreNames = (media.genre_ids || []).map(id => genreMap[id] || 'Unknown').join(', ');
            const formattedDate = media.release_date ? new Date(media.release_date).toLocaleDateString() : 'N/A';
            const firstAirDate = media.first_air_date ? new Date(media.first_air_date).toLocaleDateString() : 'N/A';
            const displayDate = media.media_type === 'movie' ? formattedDate : firstAirDate;
            const year = media.release_date ? new Date(media.release_date).getFullYear() : 'N/A';
            const ratingStars = '★'.repeat(Math.round(media.vote_average / 2)) + '☆'.repeat(5 - Math.round(media.vote_average / 2));

            return `
                <div class="media-card" data-id="${media.id}" data-type="${media.media_type}">
                    <img src="https://image.tmdb.org/t/p/w500${media.poster_path}" alt="${media.title || media.name}" class="media-image">
                    <div class="media-content">
                        <h3 class="media-title">${media.title || media.name}</h3>
                        <p class="media-type">${media.media_type === 'movie' ? '🎬 Movie' : '📺 TV Show'}</p>
                        <div class="media-details">
                            <p class="media-genres">Genres: ${genreNames}</p>
                            <div class="media-rating">
                                <span class="rating-stars">${ratingStars}</span>
                                <span>${media.vote_average.toFixed(1)}/10</span>
                            </div>
                            <p class="media-release-date">Release: ${displayDate}</p>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        $mediaContainer.html(resultsHTML);

        $mediaContainer.find('.media-card').on('click', function() {
            const mediaId = $(this).data('id');
            const mediaType = $(this).data('type');
            fetchSelectedMedia(mediaId, mediaType);
        });
    };

    const handleSearchInput = debounce(async () => {
        const searchInputValue = $('#searchInput').val().trim().toLowerCase();
        if (!searchInputValue) {
            $('#searchSuggestions').empty();
            return;
        }

        showLoading();

        try {
            // Ensure genres are already fetched
            if (Object.keys(genreMap).length === 0) {
                const genres = await fetchAllGenres();
                genreMap = genres.reduce((map, genre) => ({ ...map, [genre.id]: genre.name }), {});
            }

            const { results } = await $.getJSON(`${API_BASE_URL}/search/multi?api_key=${apiKey}&query=${encodeURIComponent(searchInputValue)}`);
            displaySearchSuggestions(results, searchInputValue);
        } catch (error) {
            handleError('An error occurred while fetching search results:', error);
        }
    }, 300);

    const setupKeyboardNavigation = ($container) => {
        const $items = $container.find('.suggestion-item');
        let currentIndex = -1;

        const selectItem = (index) => {
            $items.removeClass('selected').eq(index).addClass('selected');
        };

        $(document).on('keydown', (event) => {
            if (event.key === 'ArrowDown') {
                currentIndex = (currentIndex + 1) % $items.length;
                selectItem(currentIndex);
                event.preventDefault();
            } else if (event.key === 'ArrowUp') {
                currentIndex = (currentIndex - 1 + $items.length) % $items.length;
                selectItem(currentIndex);
                event.preventDefault();
            } else if (event.key === 'Enter') {
                if (currentIndex >= 0 && currentIndex < $items.length) {
                    $items.eq(currentIndex).click();
                    event.preventDefault();
                }
            }
        });
    };

    const fetchSelectedMedia = async (mediaId, mediaType) => {
        try {
            const media = await $.getJSON(`${API_BASE_URL}/${mediaType}/${mediaId}?api_key=${apiKey}`);
            displaySelectedMedia(media, mediaType);

            const title = media.title || media.name;
            const formattedTitle = title.toLowerCase().replace(/ /g, '-').replace(/[^\w-]/g, '');
            const newUrl = `?title=${formattedTitle}`;
            history.pushState({ title }, title, newUrl);
        } catch (error) {
            handleError('An error occurred while fetching media details:', error);
        }
    };

    const fetchTopRatedMedia = async (page = 1) => {
        try {
            const { results, page: currentPage, total_pages: totalPages } = await $.getJSON(`${API_BASE_URL}/movie/top_rated?api_key=${apiKey}&page=${page}`);
            displaySearchResults(results);
            // Removed pagination controls since they're handled elsewhere
            fetchUpcomingMedia();
        } catch (error) {
            handleError('An error occurred while fetching top-rated media:', error);
        }
    };

    const fetchUpcomingMedia = async () => {
        try {
            const { results } = await $.getJSON(`${API_BASE_URL}/movie/upcoming?api_key=${apiKey}&language=en-US&page=1`);
            const upcomingMovies = results.filter(media => new Date(media.release_date) > new Date());
            displayUpcomingMedia(upcomingMovies);
        } catch (error) {
            handleError('An error occurred while fetching upcoming media:', error);
        }
    };

    const displayUpcomingMedia = (mediaList) => {
        const upcomingMediaHTML = mediaList.map(media =>
            `<div class="text-zinc-300 mb-2"><span>${media.title}:</span> <span>${media.release_date}</span></div>`
        ).join('');
        $('#upcomingMedia').html(upcomingMediaHTML);
    };

    $(window).on('popstate', async (event) => {
        if (event.originalEvent.state && event.originalEvent.state.title) {
            const title = event.originalEvent.state.title;
            const media = await searchMediaByTitle(title);
            if (media) {
                displaySelectedMedia(media, media.media_type);
            }
        }
    });

    const searchMediaByTitle = async (title) => {
        try {
            const { results } = await $.getJSON(`${API_BASE_URL}/search/multi?api_key=${apiKey}&query=${encodeURIComponent(title)}`);
            return results[0];
        } catch (error) {
            handleError('An error occurred while searching media by title:', error);
            return null;
        }
    };

    const init = async () => {
        apiKey = await getApiKey();
        if (apiKey) {
            // Fetch and store genres globally
            const genres = await fetchAllGenres();
            genreMap = genres.reduce((map, genre) => ({ ...map, [genre.id]: genre.name }), {});

            // Removed fetchPopularMedia call
            fetchTopRatedMedia();
            fetchUpcomingMedia();
        }
    };

    init();

    $('#searchInput').on('input', handleSearchInput);

    $('#randomButton').on('click', async function() {
        try {
            const { results } = await $.getJSON(`${API_BASE_URL}/trending/all/week?api_key=${apiKey}`);
            const randomMedia = results[Math.floor(Math.random() * results.length)];
            fetchSelectedMedia(randomMedia.id, randomMedia.media_type);
        } catch (error) {
            handleError('An error occurred while fetching trending media:', error);
        }
    });

    $('input[name="mediaType"]').on('change', function() {
        const type = $(this).val();
        if (type === 'top_rated') {
            fetchTopRatedMedia();
        }
    });
});
